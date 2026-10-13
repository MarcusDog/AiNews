const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentStore } = require('../services/agent/agent-store');
const { createAgentRunsRouter } = require('../routes/agent-runs');

function fixture(t, { runtime } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-routes-'));
  const store = new AgentStore({ dbPath: path.join(dir, 'agent.db') }).initialize();
  const alice = store.createSession({ userId: 'alice', title: 'Alice research' });
  const bob = store.createSession({ userId: 'bob', title: 'Bob secret' });
  const app = express();
  app.use(express.json());
  const router = createAgentRunsRouter({
    store,
    runtime: runtime || { async run(input) { store.startRun({ userId: input.userId, runId: input.runId }); } },
    requireUser: (req, res, next) => { if (req.headers['x-test-user']) req.authUser = { id: req.headers['x-test-user'] }; next(); },
    scopesForUser: () => ['news:read', 'signals:read', 'content:read', 'creators:read']
  });
  app.use('/api/agent', router);
  const server = http.createServer(app);
  server.listen(0);
  t.after(() => { server.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const origin = async () => {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const request = async (method, url, { user = 'alice', headers = {}, body } = {}) => {
    const response = await fetch(`${await origin()}${url}`, {
      method, headers: { ...(user ? { 'x-test-user': user } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
  };
  return { store, alice, bob, request, origin, router };
}

test('persistent run routes require an authenticated user', async t => {
  const f = fixture(t);
  const result = await f.request('GET', '/api/agent/sessions', { user: null });
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('session list, create, rename, archive, and message pagination are owner scoped', async t => {
  const f = fixture(t);
  const listed = await f.request('GET', '/api/agent/sessions?limit=1');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.items.length, 1);
  assert.equal(listed.body.data.items[0].title, 'Alice research');
  const created = await f.request('POST', '/api/agent/sessions', { body: { title: 'New session' } });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal((await f.request('PATCH', `/api/agent/sessions/${id}`, { body: { title: 'Renamed' } })).body.data.title, 'Renamed');
  f.store.appendMessage({ userId: 'alice', sessionId: id, role: 'user', content: 'one' });
  f.store.appendMessage({ userId: 'alice', sessionId: id, role: 'assistant', content: 'two' });
  const page = await f.request('GET', `/api/agent/sessions/${id}/messages?limit=1`);
  assert.equal(page.body.data.items.length, 1);
  const previous = await f.request('GET', `/api/agent/sessions/${id}/messages?limit=1&before=${page.body.data.items[0].id}`);
  assert.equal(previous.body.data.items.length, 1);
  assert.notEqual(previous.body.data.items[0].id, page.body.data.items[0].id);
  assert.equal((await f.request('GET', `/api/agent/sessions/${f.bob.id}`)).status, 404);
  assert.equal((await f.request('PATCH', `/api/agent/sessions/${f.bob.id}`, { body: { title: 'intrude' } })).status, 404);
  assert.equal((await f.request('POST', `/api/agent/sessions/${f.bob.id}/archive`)).status, 404);
  assert.equal((await f.request('POST', `/api/agent/sessions/${id}/archive`)).status, 200);
  assert.equal((await f.request('GET', `/api/agent/sessions/${id}`)).body.data.archived, true);
});

test('run creation is 202, idempotent, ignores body scopes, and rejects active or key conflicts', async t => {
  let runInput;
  const f = fixture(t, { runtime: { run(input) { runInput = input; return new Promise(() => {}); } } });
  const session = (await f.request('POST', '/api/agent/sessions', { body: {} })).body.data;
  const options = { body: { message: 'Research AI' }, headers: { 'Idempotency-Key': 'request-1' } };
  const first = await f.request('POST', `/api/agent/sessions/${session.id}/runs`, options);
  assert.equal(first.status, 202);
  assert.equal(first.body.data.status, 'queued');
  assert.deepEqual(runInput.scopes, ['news:read', 'signals:read', 'content:read', 'creators:read']);
  assert.equal(runInput.userId, 'alice');
  const repeated = await f.request('POST', `/api/agent/sessions/${session.id}/runs`, options);
  assert.equal(repeated.status, 202);
  assert.equal(repeated.body.data.id, first.body.data.id);
  assert.equal((await f.request('POST', `/api/agent/sessions/${session.id}/runs`, { ...options, body: { message: 'different' } })).status, 409);
  assert.equal((await f.request('POST', `/api/agent/sessions/${session.id}/runs`, { headers: { 'Idempotency-Key': 'request-2' }, body: { message: 'Another' } })).status, 409);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runInput.signal.aborted, false);
  assert.equal((await f.request('POST', `/api/agent/runs/${first.body.data.id}/cancel`)).status, 200);
  assert.equal(runInput.signal.aborted, true);
});

test('run status, event pagination, cancellation and cross owner/run session access are hidden', async t => {
  const f = fixture(t);
  const session = f.store.createSession({ userId: 'alice', title: 'Run' });
  const run = f.store.createRun({ userId: 'alice', sessionId: session.id, requestKey: 'r', request: { message: 'Question' } });
  const status = await f.request('GET', `/api/agent/runs/${run.id}`);
  assert.equal(status.status, 200);
  assert.equal(status.body.data.status, 'queued');
  assert.equal((await f.request('GET', `/api/agent/runs/not-a-run`)).status, 404);
  assert.equal((await f.request('GET', `/api/agent/runs/${run.id}`, { user: 'bob' })).status, 404);
  assert.equal((await f.request('GET', `/api/agent/sessions/${f.bob.id}/runs/${run.id}`)).status, 404);
  const events = await f.request('GET', `/api/agent/runs/${run.id}/events?format=json&since=0&limit=1`);
  assert.equal(events.status, 200);
  assert.equal(events.body.data.items[0].sequence, 1);
  assert.equal((await f.request('POST', `/api/agent/runs/${run.id}/cancel`)).status, 200);
  assert.equal(f.store.getRun({ userId: 'alice', runId: run.id }).status, 'cancelled');
  assert.equal((await f.request('POST', `/api/agent/runs/${run.id}/cancel`, { user: 'bob' })).status, 404);
});

test('invalid bounds, malformed cursors, untrusted body scopes, and event cursor conflicts fail closed', async t => {
  const f = fixture(t);
  const session = f.store.createSession({ userId: 'alice', title: 'Run' });
  const run = f.store.createRun({ userId: 'alice', sessionId: session.id, requestKey: 'r', request: { message: 'Question' } });
  assert.equal((await f.request('GET', '/api/agent/sessions?limit=0')).status, 400);
  assert.equal((await f.request('GET', `/api/agent/sessions/${session.id}/messages?limit=101`)).status, 400);
  assert.equal((await f.request('GET', `/api/agent/runs/${run.id}/events?format=json&since=-1`)).status, 400);
  assert.equal((await f.request('GET', `/api/agent/runs/${run.id}/events?format=json&since=`)).status, 400);
  assert.equal((await f.request('GET', `/api/agent/runs/${run.id}/events?format=json&since=1`, { headers: { 'Last-Event-ID': '2' } })).status, 400);
  const untrustedSession = f.store.createSession({ userId: 'alice', title: 'Untrusted body' });
  for (const body of [
    { message: 'Hi', userId: 'bob' }, { message: 'Hi', scopes: ['admin:*'] },
    { message: 'Hi', requiredScopes: ['admin:*'] }, { message: 'Hi', maxTokens: 32768 }, { message: '   ' }
  ]) assert.equal((await f.request('POST', `/api/agent/sessions/${untrustedSession.id}/runs`, { headers: { 'Idempotency-Key': 'x' }, body })).status, 400);
  assert.equal((await f.request('POST', `/api/agent/sessions/${session.id}/runs`, { body: { message: 'Hi' } })).status, 400);
});

test('runtime launch rejection is persisted as a generic failed run', async t => {
  const f = fixture(t, { runtime: { async run() { throw new Error('provider key leaked'); } } });
  const session = f.store.createSession({ userId: 'alice', title: 'Run' });
  const started = await f.request('POST', `/api/agent/sessions/${session.id}/runs`, { headers: { 'Idempotency-Key': 'failure' }, body: { message: 'Question' } });
  assert.equal(started.status, 202);
  for (let i = 0; i < 30 && f.store.getRun({ userId: 'alice', runId: started.body.data.id }).status !== 'failed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.store.getRun({ userId: 'alice', runId: started.body.data.id }).status, 'failed');
  const events = f.store.listEvents({ userId: 'alice', runId: started.body.data.id });
  assert.equal(events.at(-1).type, 'failed');
  assert.doesNotMatch(JSON.stringify(events), /provider key leaked/);
});

test('HTTP event endpoint serves owned resumable SSE with no-store', async t => {
  const f = fixture(t);
  const session = f.store.createSession({ userId: 'alice', title: 'SSE' });
  const run = f.store.createRun({ userId: 'alice', sessionId: session.id, requestKey: 'sse', request: { message: 'Question' } });
  const response = await fetch(`${await f.origin()}/api/agent/runs/${run.id}/events?since=0`, { headers: { 'x-test-user': 'alice' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /id: 1\nevent: queued/);
  await reader.cancel();
});

test('router shutdown aborts active workers and detaches event stream subscribers', async t => {
  let signal;
  const f = fixture(t, { runtime: { run(input) { signal = input.signal; return new Promise(() => {}); } } });
  const session = f.store.createSession({ userId: 'alice', title: 'Shutdown' });
  const result = await f.request('POST', `/api/agent/sessions/${session.id}/runs`, { headers: { 'Idempotency-Key': 'shutdown' }, body: { message: 'Question' } });
  await new Promise(resolve => setImmediate(resolve));
  const sse = await fetch(`${await f.origin()}/api/agent/runs/${result.body.data.id}/events?since=0`);
  await sse.body.getReader().read();
  assert.equal(f.store.runEventListeners.size, 1);
  f.router.close();
  assert.equal(signal.aborted, true);
  assert.equal(f.store.runEventListeners.size, 0);
});

test('Nginx scopes unbuffered long timeout handling to Agent run event URLs', () => {
  const nginx = fs.readFileSync(path.join(__dirname, '../../nginx/nginx.conf'), 'utf8');
  const location = nginx.match(/location ~ \^\/api\/agent\/runs\/\[\^\/\]\+\/events\$ \{[\s\S]*?\n        \}/)?.[0];
  assert(location, 'exact Agent events location is missing');
  assert.match(location, /proxy_buffering off;/);
  assert.match(location, /proxy_cache off;/);
  assert.match(location, /gzip off;/);
  assert.match(location, /proxy_read_timeout 1h;/);
  assert(nginx.indexOf(location) < nginx.indexOf('location /api/ {'), 'Agent events route must precede the generic API proxy');
});
