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
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'completed' })), { code: 'invalid_transition' });
  assert.throws(() => store.transitionRun(runArgs(run, { status: 'awaiting_approval' })), { code: 'invalid_transition' });
  assert.equal(store.startRun(runArgs(run)).run.status, 'running');
  assert.equal(store.transitionRun(runArgs(run, { status: 'completed', payload: { answer: 'Done', verified: true } })).event.type, 'completed');
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
  for (const payload of [deep, { result: Array(LIMITS.listItems + 1).fill(1) }, { answer: 'a'.repeat(LIMITS.jsonBytes + 1) }, { result: Object.fromEntries(Array.from({ length: LIMITS.nodes + 1 }, (_, i) => [`k${i}`, i])) }]) {
    assert.throws(() => store.appendEvent(runArgs(run, { type: 'progress', payload })), { code: 'input_too_large' });
  }
  assert.throws(() => store.listEvents(runArgs(run, { limit: LIMITS.pageItems + 1 })), { code: 'invalid_input' });
});

check('close/reopen recovers queued/running/awaiting approval exactly once', (t) => {
  const { store, session } = fixture(t);
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
    store.transitionRun(runArgs(run, { status }));
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
    toolName: 'get_news', sources: [{ id: 'public-news-id', title: 'Public source', url: 'https://example.com/a' }],
    data: { id: 'public-topic-id', seq: 7, topicId: 'public-topic-id', changeType: 'updated' }
  } }));
  assert.notEqual(event.id, 'public-news-id');
  assert.equal(event.sequence, 2);
  assert.equal(event.payload.sources[0].id, 'public-news-id');
  assert.equal(event.payload.data.seq, 7);
  assert.equal(store.startRun(runArgs(run)).event.sequence, 3);
  const final = store.transitionRun(runArgs(run, { status: 'completed', payload: { status: 'forged', answer: 'Public answer', verified: true } }));
  assert.equal(final.event.payload.status, 'completed');
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
