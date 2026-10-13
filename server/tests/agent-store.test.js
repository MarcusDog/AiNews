const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const modulePath = path.join(__dirname, '../services/agent/agent-store');
const AgentStore = fs.existsSync(`${modulePath}.js`) ? require(modulePath).AgentStore : null;

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-agent-store-'));
  const dbPath = path.join(dir, 'agent.db');
  const store = new AgentStore({ dbPath, ...options });
  store.initialize();
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const session = store.createSession({ userId: 'alice', title: 'Research' });
  return { store, session, dbPath };
}
const args = (session, extra = {}) => ({ userId: 'alice', sessionId: session.id, ...extra });
const runArgs = (run, extra = {}) => ({ userId: 'alice', runId: run.id, ...extra });
const check = (name, fn) => test(name, { skip: !AgentStore }, fn);

test('AgentStore implements the persistence contract on a real temporary SQLite database', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-agent-red-'));
  const db = new Database(path.join(dir, 'red.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(typeof AgentStore, 'function', 'AgentStore implementation is missing');
});

check('schema creation is idempotent with foreign keys and all five agent tables', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: { message: 'Hello' } }));
  store.initialize();
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  const names = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const name of ['agent_sessions', 'agent_messages', 'agent_runs', 'agent_run_events', 'agent_evidence']) assert(names.includes(name));
  assert.equal(store.db.pragma('foreign_keys', { simple: true }), 1);
  assert.match(session.id, /^[0-9a-f-]{36}$/);
});

check('all session/message/run/event operations require the matching owner', (t) => {
  const { store, session } = fixture(t);
  const message = store.appendMessage(args(session, { role: 'user', content: 'Hello' }));
  const run = store.createRun(args(session, { requestKey: 'a', request: { message: 'Hello' } }));
  for (const call of [
    () => store.getSession({ userId: 'bob', sessionId: session.id }),
    () => store.updateSessionTitle({ userId: 'bob', sessionId: session.id, title: 'Stolen' }),
    () => store.archiveSession({ userId: 'bob', sessionId: session.id }),
    () => store.listMessages({ userId: 'bob', sessionId: session.id }),
    () => store.getMessage({ userId: 'bob', messageId: message.id }),
    () => store.appendMessage({ userId: 'bob', sessionId: session.id, role: 'user', content: 'Stolen' }),
    () => store.listRuns({ userId: 'bob', sessionId: session.id }),
    () => store.createRun({ userId: 'bob', sessionId: session.id, requestKey: 'x', request: {} }),
    () => store.getRun({ userId: 'bob', runId: run.id }),
    () => store.startRun({ userId: 'bob', runId: run.id }),
    () => store.cancelRun({ userId: 'bob', runId: run.id }),
    () => store.listEvents({ userId: 'bob', runId: run.id }),
    () => store.appendEvent({ userId: 'bob', runId: run.id, type: 'progress', payload: {} }),
    () => store.findRunByRequestKey({ userId: 'bob', sessionId: session.id, requestKey: 'a' })
  ]) assert.throws(call, { code: 'not_found' });
  assert.deepEqual(store.listSessions({ userId: 'bob' }), []);
  assert.equal(store.listMessages(args(session))[0].content, 'Hello');
});

check('session rename/archive and message public projections are durable', (t) => {
  const { store, session } = fixture(t);
  const renamed = store.updateSessionTitle(args(session, { title: 'Renamed' }));
  assert.equal(renamed.title, 'Renamed');
  const message = store.appendMessage(args(session, { role: 'assistant', content: 'Public answer' }));
  assert.equal(store.getMessage({ userId: 'alice', messageId: message.id }).content, 'Public answer');
  store.archiveSession(args(session));
  assert.equal(store.getSession(args(session)).archived, true);
  assert.throws(() => store.createRun(args(session, { requestKey: 'a', request: {} })), { code: 'session_archived' });
});

check('request keys are scoped to owner/session and canonical requests cannot conflict', (t) => {
  const { store, session } = fixture(t);
  const input = args(session, { requestKey: 'a', request: { message: 'Hello', mode: 'chat' } });
  const first = store.createRun(input);
  assert.equal(store.createRun(args(session, { requestKey: 'a', request: { mode: 'chat', message: 'Hello' } })).id, first.id);
  assert.equal(store.listEvents(runArgs(first)).length, 1);
  assert.throws(() => store.createRun({ ...input, request: { message: 'Changed' } }), { code: 'request_key_conflict' });
  assert.equal(store.findRunByRequestKey(args(session, { requestKey: 'a' })).id, first.id);
  const other = store.createSession({ userId: 'bob', title: 'Other' });
  assert.notEqual(store.createRun({ userId: 'bob', sessionId: other.id, requestKey: 'a', request: {} }).id, first.id);
  const second = store.createSession({ userId: 'alice', title: 'Second' });
  assert.notEqual(store.createRun(args(second, { requestKey: 'a', request: {} })).id, first.id);
});

check('database unique constraints protect active runs and request keys across connections', (t) => {
  const { store, session, dbPath } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  assert.throws(() => store.createRun(args(session, { requestKey: 'b', request: {} })), { code: 'active_run_exists' });
  const second = new Database(dbPath); t.after(() => second.close());
  const insert = second.prepare('INSERT INTO agent_runs(id,user_id,session_id,request_key,request_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  assert.throws(() => insert.run('other', 'alice', session.id, 'b', '{}', 'queued', 1, 1), /UNIQUE/);
  store.cancelRun(runArgs(run));
  assert.throws(() => insert.run('other', 'alice', session.id, 'a', '{}', 'completed', 1, 1), /UNIQUE/);
});

check('state transitions and events are atomic and terminal runs cannot restart', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'completed', payload: { answer: 'No evidence found', verified: true, citationIds: [] } })), { code: 'invalid_transition' });
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'awaiting_approval' })), { code: 'invalid_transition' });
  assert.equal(store.startRun(runArgs(run)).run.status, 'running');
  assert.equal(store.transitionRun(runArgs(run, { status: 'completed', payload: { answer: 'No evidence found', verified: true, citationIds: [] } })).event.type, 'completed');
  assert.throws(() => store.startRun(runArgs(run)), { code: 'invalid_transition' });
  assert.deepEqual(store.listEvents(runArgs(run)).map(event => event.sequence), [1, 2, 3]);
  assert.deepEqual(store.listEvents(runArgs(run, { afterSequence: 1 })).map(event => event.type), ['running', 'completed']);
});

check('event insertion failure rolls back transitions and new runs completely', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  store.db.exec("CREATE TRIGGER reject_agent_event BEFORE INSERT ON agent_run_events BEGIN SELECT RAISE(ABORT,'event blocked'); END;");
  assert.throws(() => store.startRun(runArgs(run)), /event blocked/);
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  assert.equal(store.listEvents(runArgs(run)).length, 1);
  const other = store.createSession({ userId: 'alice', title: 'Other' });
  assert.throws(() => store.createRun(args(other, { requestKey: 'x', request: {} })), /event blocked/);
  assert.equal(store.listRuns(args(other)).length, 0);
  store.db.exec('DROP TRIGGER reject_agent_event');
  assert.equal(store.startRun(runArgs(run)).event.sequence, 2);
});

check('caller data cannot forge IDs, status, event sequence or internal JSON rows', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  for (const call of [
    () => store.createSession({ userId: 'alice', title: 'x', id: 'forged' }),
    () => store.createRun(args(session, { requestKey: 'b', request: {}, status: 'completed' })),
    () => store.appendMessage(args(session, { role: 'user', content: 'x', id: 'forged' })),
    () => store.appendEvent(runArgs(run, { type: 'progress', payload: {}, sequence: 99 })),
    () => store.appendEvent(runArgs(run, { type: 'completed', payload: {} })),
    () => store.appendEvent(runArgs(run, { type: 'progress', payloadJson: '{}' }))
  ]) assert.throws(call, { code: 'invalid_input' });
});

check('private provider data, credentials, accessors and cyclic payloads are rejected', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  for (const payload of [{ thinking: 'private' }, { result: { credentials: 'private' } }, { providerContent: [] }, { raw: 'private' }, { result: { api_key: 'secret' } }]) {
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload })), { code: 'invalid_input' });
  }
  let reads = 0;
  const payload = { get message() { reads += 1; return 'private'; } };
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload })), { code: 'invalid_input' });
  assert.equal(reads, 0);
  const cyclic = {}; cyclic.result = cyclic;
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload: cyclic })), { code: 'invalid_input' });
  const output = store.getRun(runArgs(run)); output.status = 'hacked';
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  assert(!JSON.stringify(output).includes('request_json'));
});

check('UTF-8 byte, JSON depth/node/list and pagination budgets prevent oversized input', (t) => {
  const { store, session } = fixture(t);
  const { LIMITS } = require('../services/agent/agent-store');
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  assert.throws(() => store.appendMessage(args(session, { role: 'user', content: '中'.repeat(Math.floor(LIMITS.textBytes / 3) + 1) })), { code: 'input_too_large' });
  let deep = {}; for (let i = 0; i < LIMITS.depth + 1; i++) deep = { result: deep };
  for (const payload of [deep, { result: Array(LIMITS.listItems + 1).fill(1) }, { result: { answer: 'a'.repeat(LIMITS.eventJsonBytes + 1) } }, { result: Object.fromEntries(Array.from({ length: LIMITS.eventNodes + 1 }, (_, i) => [`k${i}`, i])) }]) {
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload })), { code: 'input_too_large' });
  }
  assert.throws(() => store.listEvents(runArgs(run, { limit: LIMITS.pageItems + 1 })), { code: 'invalid_input' });
});

check('close/reopen recovers queued/running/awaiting approval exactly once with coordinated opt-in', (t) => {
  const { store, session } = fixture(t, { recoverOnInitialize: true });
  const runs = [store.createRun(args(session, { requestKey: 'a', request: {} }))];
  for (const status of ['running', 'awaiting_approval']) {
    const other = store.createSession({ userId: 'alice', title: status });
    const run = store.createRun(args(other, { requestKey: 'a', request: {} }));
    store.db.prepare('UPDATE agent_runs SET status=? WHERE id=?').run(status, run.id);
    runs.push(run);
  }
  store.close(); store.initialize();
  for (const run of runs) {
    assert.equal(store.getRun(runArgs(run)).status, 'failed');
    assert.equal(store.listEvents(runArgs(run)).filter(e => e.type === 'recovered').length, 1);
  }
  store.close(); store.initialize();
  assert.equal(store.reconcileInterruptedRuns(), 0);
  for (const run of runs) assert.equal(store.listEvents(runArgs(run)).filter(e => e.type === 'recovered').length, 1);
});

check('recovery event failure leaves original active state for safe retry', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'a', request: {} }));
  store.db.exec("CREATE TRIGGER reject_recovery BEFORE INSERT ON agent_run_events WHEN NEW.type='recovered' BEGIN SELECT RAISE(ABORT,'recovery blocked'); END;");
  assert.throws(() => store.reconcileInterruptedRuns(), /recovery blocked/);
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  store.db.exec('DROP TRIGGER reject_recovery');
  assert.equal(store.reconcileInterruptedRuns(), 1);
});

check('retention removes only old terminal run trees and keeps active run/session messages', (t) => {
  let now = 1000;
  const { store, session } = fixture(t, { now: () => now, retentionMs: 500 });
  for (const status of ['completed', 'failed', 'cancelled']) {
    const run = store.createRun(args(session, { requestKey: status, request: {} }));
    store.appendMessage(args(session, { runId: run.id, role: 'assistant', content: status }));
    if (status !== 'cancelled') store.startRun(runArgs(run));
    store.transitionRun(runArgs(run, { status, ...(status === 'completed' ? { payload: { answer: 'No evidence found', verified: true, citationIds: [] } } : {}) }));
  }
  now = 2000;
  store.appendMessage(args(session, { role: 'user', content: 'Keep conversation' }));
  const active = store.createRun(args(session, { requestKey: 'active', request: {} }));
  store.appendMessage(args(session, { runId: active.id, role: 'user', content: 'Keep active' }));
  assert.deepEqual(store.pruneRetention(), { runs: 3, messages: 3, events: 8, evidence: 0 });
  assert.equal(store.getRun(runArgs(active)).status, 'queued');
  assert.equal(store.listMessages(args(session)).length, 2);
  assert.deepEqual(store.db.pragma('foreign_key_check'), []);
});

check('message insertion order is stable when timestamps collide', (t) => {
  const { store, session } = fixture(t, { now: () => 1000 });
  for (let i = 0; i < 20; i++) store.appendMessage(args(session, { role: 'user', content: `message ${i}` }));
  assert.deepEqual(store.listMessages(args(session)).map(m => m.content), Array.from({ length: 20 }, (_, i) => `message ${i}`));
});

check('terminal runs reject ordinary progress events without consuming sequence numbers', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'terminal', request: {} }));
  store.cancelRun(runArgs(run));
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload: { message: 'Too late' } })), { code: 'run_terminal' });
  assert.deepEqual(store.listEvents(runArgs(run)).map(event => event.sequence), [1, 2]);
});

check('run creation and status updates sort sessions by most recent durable activity', (t) => {
  let now = 1000;
  const { store, session } = fixture(t, { now: () => now });
  now = 2000;
  const other = store.createSession({ userId: 'alice', title: 'Other' });
  now = 3000;
  const run = store.createRun(args(session, { requestKey: 'active', request: {} }));
  assert.equal(store.getSession(args(session)).updatedAt, 3000);
  assert.equal(store.listSessions({ userId: 'alice' })[0].id, session.id);
  now = 4000;
  store.updateSessionTitle(args(other, { title: 'New name' }));
  now = 5000;
  store.startRun(runArgs(run));
  assert.equal(store.listSessions({ userId: 'alice' })[0].updatedAt, 5000);
});

check('injected SQLite connection is reusable and recovery can be disabled for live collaborators', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'live', request: {} }));
  const shared = new AgentStore({ db: store.db, recoverOnInitialize: false });
  shared.initialize();
  assert.equal(shared.getRun(runArgs(run)).status, 'queued');
  shared.close();
  assert.equal(store.db.open, true);
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  shared.initialize();
  assert.equal(shared.startRun(runArgs(run)).run.status, 'running');
  shared.close();
  assert.equal(store.getRun(runArgs(run)).status, 'running');
});

check('shared SQLite connections default to no recovery and preserve active work and ownership', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'shared-default', request: {} }));
  const shared = new AgentStore({ db: store.db });
  shared.initialize();
  assert.equal(shared.getRun(runArgs(run)).status, 'queued');
  assert.equal(shared.listEvents(runArgs(run)).length, 1);
  shared.close();
  assert.equal(store.db.open, true);
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
});

check('shared database recovery requires an explicit startup opt-in', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'shared-startup', request: {} }));
  const shared = new AgentStore({ db: store.db, recoverOnInitialize: true });
  shared.initialize();
  assert.equal(shared.getRun(runArgs(run)).status, 'failed');
  assert.equal(shared.listEvents(runArgs(run)).filter(event => event.type === 'recovered').length, 1);
  shared.close();
  assert.equal(store.db.open, true);
});

check('event JSON rejects provider conversation containers at every nesting level', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'private-event', request: {} }));
  const containers = [
    { context: { role: 'assistant', content: 'private provider thought' } },
    { history: [{ role: 'assistant', content: 'private provider thought' }] },
    { content: 'private provider thought' }, { role: 'assistant' },
    { data: { context: { role: 'assistant', content: 'private provider thought' } } },
    { result: { history: [{ role: 'assistant', content: 'private provider thought' }] } },
    { sources: [{ content: 'private provider thought' }] },
    { data: { role: 'assistant', content: 'private provider thought' } },
    { provider: { message: 'private provider thought' } },
    { data: { provider: { name: 'provider', message: 'private provider thought' } } },
    { result: { message: { text: 'private provider thought' } } }
  ];
  for (const payload of containers) assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload })), { code: 'invalid_input' });
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'running', payload: containers[0] })), { code: 'invalid_input' });
  assert.equal(store.getRun(runArgs(run)).status, 'queued');
  assert.equal(store.listEvents(runArgs(run)).length, 1);
});

check('run requests reject provider histories, nested message containers and event-result containers', (t) => {
  const { store, session } = fixture(t);
  for (const request of [
    { message: 'Public task', history: [{ role: 'assistant', content: 'private provider thought' }] },
    { context: { role: 'assistant', content: 'private provider thought' } },
    { message: { role: 'assistant', content: 'private provider thought' } },
    { role: 'assistant', content: 'private provider thought' },
    { result: { text: 'private provider thought' } },
    { provider: { message: 'private provider thought' } },
    { message: { text: 'private provider thought' } }
  ]) assert.throws(() => store.createRun(args(session, { requestKey: 'private-request', request })), { code: 'invalid_input' });
  assert.equal(store.listRuns(args(session)).length, 0);
});

check('event payload roots cannot spoof envelope identity while nested public IDs remain distinct', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'event-identity', request: {} }));
  for (const [key, value] of Object.entries({ id: 'forged', runId: 'forged', sequence: 99, seq: 99, type: 'forged', createdAt: 0 })) {
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload: { [key]: value } })), { code: 'invalid_input' });
    assert.throws(() => store.transitionRun(runArgs(run, { status: 'running', payload: { [key]: value } })), { code: 'invalid_input' });
  }
  const event = store.appendEvent(runArgs(run, { type: 'tool_result', payload: {
    toolName: 'get_topic_changes',
    result: { ok: true, data: { items: [{ seq: 7, topicId: 'public-topic-id', changeType: 'updated', changedAt: '2026-10-13' }], expired: false, nextCursor: 7, oldestCursor: 1, latestCursor: 7 } }
  } }));
  assert.notEqual(event.id, 'public-news-id');
  assert.equal(event.sequence, 2);
  assert.equal(event.payload.result.data.items[0].seq, 7);
  const { project, schemas } = require('../services/agent/public-projections');
  const news = store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result: { ok: true, data: {
    items: [project(schemas.news, { id: 'public-news-id', title: 'Public source', url: 'https://example.com/a' })], total: 1
  } } } }));
  assert.equal(news.payload.result.data.items[0].id, 'public-news-id');
  assert.equal(store.startRun(runArgs(run)).event.sequence, 4);
  const final = store.transitionRun(runArgs(run, { status: 'completed', payload: { answer: 'No evidence found', verified: true, citationIds: [] } }));
  assert.equal(final.event.payload.status, 'completed');
});

check('two default owning live connections never recover each others active runs', (t) => {
  const { store, session, dbPath } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'live-owned', request: {} }));
  store.startRun(runArgs(run));
  const second = new AgentStore({ dbPath }); t.after(() => second.close());
  second.initialize();
  assert.equal(second.getRun(runArgs(run)).status, 'running');
  assert.equal(second.listEvents(runArgs(run)).length, 2);
  second.close(); second.initialize();
  assert.equal(store.getRun(runArgs(run)).status, 'running');
});

check('message pagination returns recent messages in insertion order and reaches all older messages', (t) => {
  const { store, session } = fixture(t, { now: () => 1000 });
  const messages = Array.from({ length: 123 }, (_, i) => store.appendMessage(args(session, { role: 'user', content: `message ${i}` })));
  const recent = store.listMessages(args(session));
  assert.deepEqual(recent.map(row => row.id), messages.slice(-50).map(row => row.id));
  const all = []; let beforeMessageId;
  for (;;) {
    const input = args(session, { limit: 17 }); if (beforeMessageId) input.beforeMessageId = beforeMessageId;
    const page = store.listMessages(input); if (!page.length) break;
    all.unshift(...page); beforeMessageId = page[0].id;
  }
  assert.deepEqual(all.map(row => row.id), messages.map(row => row.id));
  const other = store.createSession({ userId: 'alice', title: 'Other' });
  const foreign = store.appendMessage(args(other, { role: 'user', content: 'Other' }));
  for (const id of ['forged', foreign.id]) assert.throws(() => store.listMessages(args(session, { beforeMessageId: id })), { code: 'not_found' });
  assert.throws(() => store.listMessages({ userId: 'bob', sessionId: session.id, beforeMessageId: messages[0].id }), { code: 'not_found' });
});

check('session and run pagination reaches 101+ same-time rows with owner/session scoped cursors', (t) => {
  const { store, session } = fixture(t, { now: () => 1000 });
  const sessions = [session];
  for (let i = 0; i < 111; i++) sessions.push(store.createSession({ userId: 'alice', title: `Session ${i}` }));
  const allSessions = []; let beforeSessionId; let beforeSessionUpdatedAt;
  for (;;) {
    const input = { userId: 'alice', limit: 19 }; if (beforeSessionId) Object.assign(input, { beforeSessionId, beforeSessionUpdatedAt });
    const page = store.listSessions(input); if (!page.length) break;
    allSessions.push(...page); beforeSessionId = page.at(-1).id; beforeSessionUpdatedAt = page.at(-1).updatedAt;
  }
  assert.deepEqual(allSessions.map(row => row.id), sessions.map(row => row.id).reverse());
  const foreign = store.createSession({ userId: 'bob', title: 'Other owner' });
  for (const id of ['forged', foreign.id]) assert.throws(() => store.listSessions({ userId: 'alice', beforeSessionId: id, beforeSessionUpdatedAt: 1000 }), { code: 'not_found' });
  const runs = [];
  for (let i = 0; i < 112; i++) {
    const run = store.createRun(args(session, { requestKey: `run-${i}`, request: {} }));
    runs.push(run); store.cancelRun(runArgs(run));
  }
  const allRuns = []; let beforeRunId;
  for (;;) {
    const input = args(session, { limit: 23 }); if (beforeRunId) input.beforeRunId = beforeRunId;
    const page = store.listRuns(input); if (!page.length) break;
    allRuns.push(...page); beforeRunId = page.at(-1).id;
  }
  assert.deepEqual(allRuns.map(row => row.id), runs.map(row => row.id).reverse());
  const otherRun = store.createRun(args(sessions[1], { requestKey: 'other', request: {} }));
  for (const id of ['forged', otherRun.id]) assert.throws(() => store.listRuns(args(session, { beforeRunId: id })), { code: 'not_found' });
  assert.throws(() => store.listRuns({ userId: 'bob', sessionId: foreign.id, beforeRunId: runs[0].id }), { code: 'not_found' });
});

check('terminal runs reject associated messages while unrelated user conversation remains writable', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'terminal-message', request: {} }));
  store.cancelRun(runArgs(run));
  assert.throws(() => store.appendMessage(args(session, { runId: run.id, role: 'assistant', content: 'Too late' })), { code: 'run_terminal' });
  assert.equal(store.listMessages(args(session)).length, 0);
  store.appendMessage(args(session, { role: 'user', content: 'New question' }));
  assert.equal(store.listMessages(args(session)).length, 1);
});

check('ordinary events cannot smuggle terminal state or unaudited drafts under any event type', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'no-draft', request: {} }));
  for (const type of ['progress', 'tool_result', 'something_custom']) {
    for (const payload of [{ status: 'completed' }, { answer: 'Unaudited draft' }, { verified: true }, { text: 'Unaudited draft' }, { error: { code: 'failed', message: 'Terminal error' } }]) {
      assert.throws(() => store.appendEvent(runArgs(run, { type, payload })), { code: 'invalid_input' });
    }
  }
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'something_custom', payload: { result: { answer: 'Draft' } } })), { code: 'invalid_input' });
  assert.equal(store.listEvents(runArgs(run)).length, 1);
  assert.equal(store.appendEvent(runArgs(run, { type: 'something_custom', payload: { message: 'Searching public sources', step: 1 } })).sequence, 2);
});

check('transition payload schemas require audited completion and distinguish running/failure/cancellation', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'transition-contract', request: {} }));
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'running', payload: { answer: 'Draft', verified: true } })), { code: 'invalid_input' });
  store.startRun(runArgs(run));
  for (const status of ['failed', 'cancelled']) assert.throws(() => store.transitionRun(runArgs(run, { status, payload: { answer: 'Draft', verified: true } })), { code: 'invalid_input' });
  for (const payload of [{ answer: 'Draft' }, { answer: 'Draft', verified: false }, { error: { code: 'failed', message: 'Error' } }]) assert.throws(() => store.transitionRun(runArgs(run, { status: 'completed', payload })), { code: 'invalid_input' });
  assert.equal(store.listEvents(runArgs(run)).length, 2);
  const { EvidenceLedger } = require('../services/agent/evidence-ledger');
  new EvidenceLedger({ store }).registerEvidence({ userId: 'alice', runId: run.id, source: { title: 'Public source', url: 'https://example.com/a' } });
  assert.equal(store.transitionRun(runArgs(run, { status: 'completed', payload: { answer: 'Audited public answer [S1]', verified: true, citationIds: ['S1'] } })).event.sequence, 3);
});

check('ordinary tool events reject root sources and citation IDs despite otherwise valid tool results', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'no-root-citations', request: {} }));
  for (const extra of [{ sources: [{ title: 'Injected', url: 'https://example.com/a' }] }, { citationIds: ['S999'] }, { sourceIds: ['S999'] }]) {
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result: { ok: true, data: { items: [], total: 0 } }, ...extra } })), { code: 'invalid_input' });
  }
  assert.equal(store.listEvents(runArgs(run)).length, 1);
});

check('nested event URLs must already be canonical public destinations while null remains valid', (t) => {
  const { project, schemas } = require('../services/agent/public-projections');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'event-url-boundary', request: {} }));
  const news = project(schemas.news, { title: 'Public source', url: 'https://example.com/a' });
  for (const url of ['https://127.0.0.1/private', 'https://localhost/private', 'https://user:password@example.com/a', 'https://example.com/a?token=secret', 'https://example.com/a?utm_source=tracking', 'https://example.com/a#fragment']) {
    const result = { ok: true, data: { items: [{ ...news, url }], total: 1 } };
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result } })), { code: 'invalid_input' });
  }
  const signal = project(schemas.signal, {}); const topic = project(schemas.topic, {});
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'get_topic_evidence', result: { ok: true, data: { ...topic, signals: [{ ...signal, canonicalUrl: 'https://127.0.0.1/private' }] } } } })), { code: 'invalid_input' });
  const post = project(schemas.post, {});
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_creator_posts', result: { ok: true, data: { items: [{ ...post, provenanceUrl: 'https://localhost/private' }] } } } })), { code: 'invalid_input' });
  assert.equal(store.listEvents(runArgs(run)).length, 1);
  const event = store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result: { ok: true, data: { items: [news, { ...news, url: null }], total: 2 } } } }));
  assert.deepEqual(event.payload.result.data.items.map(item => item.url), ['https://example.com/a', null]);
});

check('registry-approved roughly 123KB results fit the bounded durable event budget', async (t) => {
  const { createReadTools } = require('../services/agent/tools/read-tools');
  const { ToolRegistry } = require('../services/agent/tool-registry');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'large-tool-result', request: {} }));
  const article = { ...Object.fromEntries(['id', 'title', 'source', 'category', 'publishedAt', 'sourceGroup', 'region'].map(key => [key, 'a'.repeat(600)])), description: 'd'.repeat(1000), url: `https://example.com/${'p'.repeat(1880)}` };
  const registry = new ToolRegistry(createReadTools({ newsService: { getLatestNews: () => ({ data: Array.from({ length: 17 }, () => article), total: 17 }) } }));
  const result = await registry.execute('list_latest_news', { limit: 17 }, { scopes: ['news:read'] });
  assert.equal(result.ok, true);
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
  assert(bytes >= 120000 && bytes < 131072, `Actual legitimate registry result: ${bytes} bytes`);
  const event = store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', arguments: { limit: 17 }, result } }));
  assert.deepEqual(event.payload.result, result);
});

check('registry-approved nested topic results also fit the bounded event node budget', async (t) => {
  const { createReadTools } = require('../services/agent/tools/read-tools');
  const { ToolRegistry } = require('../services/agent/tool-registry');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'nested-topic-result', request: {} }));
  const topic = { title: 'Public topic', signals: Array.from({ length: 3 }, () => ({ title: 'Public signal', url: 'https://example.com/a', canonicalUrl: 'https://example.com/a' })) };
  const registry = new ToolRegistry(createReadTools({ signalService: { listTopics: () => Array.from({ length: 50 }, () => topic) } }));
  const result = await registry.execute('list_hot_topics', { limit: 50 }, { scopes: ['signals:read'] });
  assert.equal(result.ok, true);
  assert(Buffer.byteLength(JSON.stringify(result)) <= 131072);
  assert.equal(store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_hot_topics', arguments: { limit: 50 }, result } })).payload.result.data.items.length, 50);
});

check('event JSON rejects its exact byte-budget plus one and text remains individually bounded', (t) => {
  const { LIMITS } = require('../services/agent/agent-store');
  assert.equal(LIMITS.eventJsonBytes, 163840);
  assert.equal(LIMITS.jsonBytes, 65536);
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'event-byte-boundary', request: {} }));
  const payload = { message: '', summary: '', notice: '', name: '', toolName: '' };
  let remaining = LIMITS.eventJsonBytes + 1 - Buffer.byteLength(JSON.stringify(payload));
  for (const key of Object.keys(payload)) { const size = Math.min(remaining, LIMITS.textBytes); payload[key] = 'a'.repeat(size); remaining -= size; }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(payload)), LIMITS.eventJsonBytes + 1);
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload })), { code: 'input_too_large' });
  assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload: { message: 'a'.repeat(LIMITS.textBytes + 1) } })), { code: 'input_too_large' });
  assert.equal(store.listEvents(runArgs(run)).length, 1);
});

check('session cursors retain the prior page timestamp when the anchor session is updated', (t) => {
  let now = 1000;
  const { store, session: oldest } = fixture(t, { now: () => now });
  now = 2000; const c = store.createSession({ userId: 'alice', title: 'C' });
  now = 3000; const b = store.createSession({ userId: 'alice', title: 'B' });
  now = 4000; const a = store.createSession({ userId: 'alice', title: 'A' });
  const first = store.listSessions({ userId: 'alice', limit: 2 });
  assert.deepEqual(first.map(item => item.id), [a.id, b.id]);
  now = 5000; store.updateSessionTitle(args(b, { title: 'B updated' }));
  const next = store.listSessions({ userId: 'alice', limit: 2, beforeSessionId: b.id, beforeSessionUpdatedAt: first[1].updatedAt });
  assert.deepEqual(next.map(item => item.id), [c.id, oldest.id]);
  assert.equal(new Set([...first, ...next].map(item => item.id)).size, 4);
  for (const cursor of [{ beforeSessionId: b.id }, { beforeSessionUpdatedAt: 3000 }, { beforeSessionId: b.id, beforeSessionUpdatedAt: 1.5 }, { beforeSessionId: b.id, beforeSessionUpdatedAt: -1 }]) {
    assert.throws(() => store.listSessions({ userId: 'alice', ...cursor }), { code: 'invalid_input' });
  }
});

check('tool_result has exactly one mandatory success or failure registry envelope', (t) => {
  const { ERRORS } = require('../services/agent/tool-registry');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'tool-envelope', request: {} }));
  const data = { items: [], total: 0 };
  const error = { code: 'tool_failed', message: ERRORS.tool_failed };
  for (const payload of [
    { toolName: 'list_latest_news' }, { toolName: 'list_latest_news', data },
    { toolName: 'list_latest_news', data, result: { ok: true, data } },
    { toolName: 'list_latest_news', result: { ok: true, data, error } },
    { toolName: 'list_latest_news', result: { ok: false, error, data } },
    { toolName: 'list_latest_news', result: { ok: false } }
  ]) assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload })), { code: 'invalid_input' });
  assert.equal(store.listEvents(runArgs(run)).length, 1);
  for (const result of [{ ok: true, data }, { ok: false, error }]) {
    assert.deepEqual(store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result } })).payload.result, result);
  }
  for (const type of ['tool_started', 'tool_call']) assert.equal(store.appendEvent(runArgs(run, { type, payload: { toolName: 'search_news', arguments: { q: 'Public' } } })).type, type);
});

check('all nested evidence URL fields reject malformed DNS labels and reserved hostnames', (t) => {
  const { project, schemas } = require('../services/agent/public-projections');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'dns-event-boundary', request: {} }));
  const news = project(schemas.news, { title: 'Public source' });
  const topic = project(schemas.topic, {}); const signal = project(schemas.signal, {}); const post = project(schemas.post, {});
  for (const host of ['foo..bar', '-foo.com', 'foo-.com', '.example', 'under_score.com', 'foo.test', 'foo.example', 'foo.onion', 'example.com..', 'example.com...']) {
    const url = `https://${host}/a`;
    for (const payload of [
      { toolName: 'list_latest_news', result: { ok: true, data: { items: [{ ...news, url }], total: 1 } } },
      { toolName: 'get_topic_evidence', result: { ok: true, data: { ...topic, signals: [{ ...signal, canonicalUrl: url }] } } },
      { toolName: 'list_creator_posts', result: { ok: true, data: { items: [{ ...post, provenanceUrl: url }] } } }
    ]) assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload })), { code: 'invalid_input' });
  }
  assert.equal(store.listEvents(runArgs(run)).length, 1);
  const result = { ok: true, data: { items: [{ ...news, url: 'https://xn--fsqu00a.xn--fiqs8s/a' }], total: 1 } };
  assert.equal(store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'list_latest_news', result } })).payload.result.data.items[0].url, result.data.items[0].url);
});

check('all eleven real tool contracts and registry result envelopes fit durable tool projections', async (t) => {
  const { createReadTools } = require('../services/agent/tools/read-tools');
  const { ToolRegistry } = require('../services/agent/tool-registry');
  const { validate } = require('../services/agent/tool-schemas');
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'all-tools', request: {} }));
  const sample = (schema, key = '') => {
    if (schema.enum) return schema.enum[0];
    const type = (Array.isArray(schema.type) ? schema.type : [schema.type]).find(item => item !== 'null');
    if (type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([name, child]) => [name, sample(child, name)]));
    if (type === 'array') return Array.from({ length: Math.max(schema.minItems || 0, Math.min(1, schema.maxItems)) }, () => sample(schema.items));
    if (type === 'string') return /url$/i.test(key) ? 'https://example.com/public' : 'public';
    if (type === 'boolean') return false;
    if (type === 'integer' || type === 'number') return Math.max(0, schema.minimum);
    return null;
  };
  const declarations = createReadTools().map(tool => ({ ...tool, execute: () => sample(tool.outputSchema) }));
  assert.equal(declarations.length, 11);
  const registry = new ToolRegistry(declarations);
  for (const tool of registry.list()) {
    const input = sample(tool.inputSchema);
    assert(validate(tool.inputSchema, input), tool.name);
    const result = await registry.execute(tool.name, input, { scopes: [tool.requiredScope] });
    assert.equal(result.ok, true, tool.name);
    const event = store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: tool.name, arguments: input, result } }));
    assert.deepEqual(event.payload.result, result, tool.name);
    const failure = await registry.execute(tool.name, input, { scopes: [] });
    assert.equal(failure.ok, false);
    assert.deepEqual(store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: tool.name, arguments: input, result: failure } })).payload.result, failure, tool.name);
  }
  const actualChanges = new ToolRegistry(createReadTools({ signalService: { listChanges: () => ({ items: [{ seq: 4, topicId: 't1', changeType: 'updated', changedAt: '2026-10-13' }], expired: false, nextCursor: 4, oldestCursor: 1, latestCursor: 4 }) } }));
  const result = await actualChanges.execute('get_topic_changes', { since: 1, limit: 2 }, { scopes: ['signals:read'] });
  assert.equal(result.ok, true);
  assert.equal(store.appendEvent(runArgs(run, { type: 'tool_result', payload: { toolName: 'get_topic_changes', arguments: { since: 1, limit: 2 }, result } })).payload.result.data.items[0].seq, 4);
});

check('symbols, hidden fields and getters are rejected without reading accessors', (t) => {
  const { store, session } = fixture(t);
  const run = store.createRun(args(session, { requestKey: 'descriptor-boundary', request: {} }));
  const ownerGetter = { title: 'Owned' }; let reads = 0;
  Object.defineProperty(ownerGetter, 'userId', { get() { reads++; return reads > 1 ? 'bob' : 'alice'; } });
  assert.throws(() => store.createSession(ownerGetter), { code: 'invalid_input' });
  assert.equal(reads, 0);
  const hidden = { message: 'Public' }; Object.defineProperty(hidden, 'secret', { value: 'Private', enumerable: false });
  const symbol = { message: 'Public', [Symbol('secret')]: 'Private' };
  const array = ['Public']; Object.defineProperty(array, 'hidden', { value: 'Private' });
  for (const payload of [hidden, symbol, { result: hidden }, { result: symbol }, { result: array }]) assert.throws(() => store.appendEvent(runArgs(run, { type: 'tool_result', payload })), { code: 'invalid_input' });
  const input = args(session, { role: 'user', content: 'Public', [Symbol('owner')]: 'bob' });
  assert.throws(() => store.appendMessage(input), { code: 'invalid_input' });
});

check('outer transactions are rejected instead of silently downgrading IMMEDIATE to SAVEPOINT', (t) => {
  const { store, session } = fixture(t);
  store.db.exec('BEGIN');
  try { assert.throws(() => store.createRun(args(session, { requestKey: 'nested', request: {} })), { code: 'unsupported_transaction_context' }); }
  finally { store.db.exec('ROLLBACK'); }
  assert.equal(store.listRuns(args(session)).length, 0);
});

check('independent SQLite workers serialize duplicate runs, event sequences and source identity allocation', async (t) => {
  const { Worker } = require('node:worker_threads');
  const { store, session, dbPath } = fixture(t);
  const workerCode = `
    const { parentPort, workerData } = require('node:worker_threads');
    const { AgentStore } = require(workerData.storePath);
    const { EvidenceLedger } = require(workerData.ledgerPath);
    const store = new AgentStore({ dbPath: workerData.dbPath, recoverOnInitialize: false });
    store.initialize();
    parentPort.once('message', () => {
      try {
        const run = store.createRun({ userId: 'alice', sessionId: workerData.sessionId, requestKey: 'concurrent', request: { message: 'Same request' } });
        const ledger = new EvidenceLedger({ store });
        const evidence = ['a', 'b', 'c'].map(item => ledger.registerEvidence({ userId: 'alice', runId: run.id, source: { title: item, url: 'https://example.com/' + item } }).citationId);
        const event = store.appendEvent({ userId: 'alice', runId: run.id, type: 'progress', payload: { message: 'Worker progress' } });
        parentPort.postMessage({ runId: run.id, evidence, sequence: event.sequence });
      } catch (error) { parentPort.postMessage({ error: error.code || error.message }); }
      finally { store.close(); parentPort.close(); }
    });
    parentPort.postMessage({ ready: true });
  `;
  const workers = Array.from({ length: 4 }, () => new Worker(workerCode, { eval: true, workerData: {
    dbPath, sessionId: session.id, storePath: path.resolve(__dirname, '../services/agent/agent-store.js'),
    ledgerPath: path.resolve(__dirname, '../services/agent/evidence-ledger.js')
  } }));
  t.after(() => Promise.all(workers.map(worker => worker.terminate())));
  await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
    worker.once('message', value => value.ready ? resolve() : reject(new Error('Worker failed to initialize')));
    worker.once('error', reject);
  })));
  const results = Promise.all(workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); })));
  workers.forEach(worker => worker.postMessage('start'));
  const output = await results;
  assert(output.every(value => !value.error), JSON.stringify(output));
  assert.equal(new Set(output.map(value => value.runId)).size, 1);
  assert(output.every(value => JSON.stringify(value.evidence) === '["S1","S2","S3"]'));
  assert.deepEqual(output.map(value => value.sequence).sort((a, b) => a - b), [2, 3, 4, 5]);
  assert.deepEqual(store.listEvents({ userId: 'alice', runId: output[0].runId }).map(event => event.sequence), [1, 2, 3, 4, 5]);
});
