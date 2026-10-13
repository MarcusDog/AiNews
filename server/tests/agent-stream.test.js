const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentStore } = require('../services/agent/agent-store');
const { RunEventStream } = require('../services/agent/run-event-stream');

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stream-'));
  const dbPath = path.join(dir, 'agent.db');
  const store = new AgentStore({ dbPath }).initialize();
  const session = store.createSession({ userId: 'alice', title: 'Stream' });
  const run = store.createRun({ userId: 'alice', sessionId: session.id, requestKey: 'stream', request: { message: 'Question' } });
  const stream = new RunEventStream({ store, heartbeatMs: 15, ...options });
  t.after(() => { stream.close?.(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, dbPath, store, session, run, stream };
}
class Request extends EventEmitter {}
class Response extends EventEmitter {
  constructor() { super(); this.frames = []; this.headers = {}; this.writable = true; this.accept = true; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  flushHeaders() { this.flushed = true; }
  write(frame) { this.frames.push(frame); return this.accept; }
  end() { this.ended = true; this.emit('close'); }
}
const connect = (f, options = {}) => {
  const req = new Request(); const res = new Response();
  const cleanup = f.stream.connect({ userId: 'alice', runId: f.run.id, req, res, afterSequence: 0, ...options });
  return { req, res, cleanup };
};
const waitFor = async predicate => { for (let i = 0; i < 40; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } };

test('SSE replays only durable owned events with sequence IDs and stable named public payloads', async t => {
  const f = fixture(t);
  f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'Searching', step: 1 } });
  const { res, cleanup } = connect(f);
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.match(res.headers['cache-control'], /no-store/);
  assert.match(res.frames[0], /id: 1\nevent: queued\ndata: \{"sequence":1,"type":"queued","payload":\{"status":"queued"\},"createdAt":\d+\}/);
  assert.match(res.frames[1], /id: 2\nevent: progress/);
  assert.doesNotMatch(res.frames.join(''), /userId|requestKey|sessionId|secret/);
  cleanup();
});

test('SSE polling sees other-store commits without duplicates or owner leakage', async t => {
  const f = fixture(t, { pollMs: 10 });
  const otherStore = new AgentStore({ dbPath: f.dbPath }).initialize();
  t.after(() => otherStore.close());
  const bobSession = otherStore.createSession({ userId: 'bob', title: 'Other owner' });
  const bobRun = otherStore.createRun({ userId: 'bob', sessionId: bobSession.id, requestKey: 'private', request: { message: 'Private' } });
  // Drain initial local wakeups before subscribing so only the new second-store
  // commit can cause delivery; external writers have no shared listener set.
  await new Promise(resolve => setImmediate(resolve));
  const { res, cleanup } = connect(f, { afterSequence: 1 });
  otherStore.startRun({ userId: 'alice', runId: f.run.id });
  otherStore.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'from second store' } });
  otherStore.appendEvent({ userId: 'bob', runId: bobRun.id, type: 'progress', payload: { message: 'bob private event' } });
  await waitFor(() => res.frames.some(frame => /from second store/.test(frame)));
  assert.equal(res.frames.filter(frame => /from second store/.test(frame)).length, 1);
  assert.doesNotMatch(res.frames.join(''), /bob private event|userId|requestKey/);
  cleanup();
});

test('SSE tails after the last event ID, writes before notifying, and closes after durable terminal replay', async t => {
  const f = fixture(t);
  const { req, res, cleanup } = connect(f, { afterSequence: 1 });
  // IncomingMessage close can mean the GET request body completed; the response
  // connection remains alive for SSE and is cleaned up on abort/response close.
  req.emit('close');
  f.store.startRun({ userId: 'alice', runId: f.run.id });
  await waitFor(() => res.frames.some(frame => /id: 2\nevent: running/.test(frame)));
  assert.equal(f.store.listEvents({ userId: 'alice', runId: f.run.id }).at(-1).type, 'running');
  f.store.cancelRun({ userId: 'alice', runId: f.run.id });
  cleanup();
  const terminal = connect(f, { afterSequence: 2 });
  assert.match(terminal.res.frames[0], /id: 3\nevent: cancelled/);
  assert.equal(terminal.res.ended, true);
});

test('Last-Event-ID and query cursor accept only safe integers and reject conflicting values', async t => {
  const f = fixture(t);
  assert.throws(() => connect(f, { afterSequence: '1.5' }), { code: 'invalid_cursor' });
  assert.throws(() => connect(f, { afterSequence: -1 }), { code: 'invalid_cursor' });
  assert.throws(() => connect(f, { afterSequence: Number.MAX_SAFE_INTEGER + 1 }), { code: 'invalid_cursor' });
  assert.throws(() => connect(f, { afterSequence: '' }), { code: 'invalid_cursor' });
  assert.throws(() => f.stream.parseCursor({ lastEventId: '2', since: '3' }), { code: 'invalid_cursor' });
  assert.throws(() => f.stream.parseCursor({ since: '01' }), { code: 'invalid_cursor' });
  assert.throws(() => f.stream.parseCursor({ since: String(Number.MAX_SAFE_INTEGER + 1) }), { code: 'invalid_cursor' });
  assert.equal(f.stream.parseCursor({ lastEventId: '2', since: '2' }), 2);
});

test('SSE event projection includes the durable creation timestamp', t => {
  const f = fixture(t);
  const event = f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'Timed' } });
  const { res, cleanup } = connect(f);
  const frame = res.frames.find(item => item.includes('event: progress'));
  const data = JSON.parse(frame.match(/data: (.+)\n\n/)[1]);
  const jsonEvent = f.store.listEvents({ userId: 'alice', runId: f.run.id, afterSequence: 1, limit: 1 })[0];
  assert.equal(data.createdAt, jsonEvent.createdAt);
  assert.equal(data.createdAt, event.createdAt);
  cleanup();
});

test('RunEventStream stops its polling timer on close', t => {
  const f = fixture(t, { pollMs: 10 });
  const { cleanup } = connect(f);
  assert(f.stream.pollTimer);
  f.stream.close();
  assert.equal(f.stream.pollTimer, null);
  cleanup();
});

test('heartbeats are comments and disconnect only removes listeners without cancelling execution', async t => {
  const f = fixture(t, { heartbeatMs: 10 });
  f.store.startRun({ userId: 'alice', runId: f.run.id });
  const { req, res, cleanup } = connect(f, { afterSequence: 2 });
  await waitFor(() => res.frames.some(frame => frame.startsWith(': heartbeat')));
  req.emit('aborted');
  assert.equal(f.store.getRun({ userId: 'alice', runId: f.run.id }).status, 'running');
  const count = res.frames.length;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(res.frames.length, count);
  cleanup();
});

test('backpressure pauses database reads until drain and concurrent subscriptions clean up independently', async t => {
  const f = fixture(t, { pollMs: 10 });
  f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'one' } });
  await new Promise(resolve => setImmediate(resolve));
  let reads = 0;
  const listEvents = f.store.listEvents.bind(f.store);
  f.store.listEvents = (...args) => { reads++; return listEvents(...args); };
  const first = connect(f);
  first.res.accept = false;
  f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'two' } });
  await new Promise(resolve => setImmediate(resolve));
  const readsAtBackpressure = reads;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(reads, readsAtBackpressure);
  const firstBeforeDrain = first.res.frames.length;
  f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'three' } });
  first.res.accept = true;
  first.res.emit('drain');
  await waitFor(() => first.res.frames.some(frame => /event: progress/.test(frame) && /three/.test(frame)));
  assert(firstBeforeDrain <= 3);
  assert.match(first.res.frames.at(-1), /three/);
  const second = connect(f);
  second.req.emit('aborted');
  first.cleanup(); second.cleanup();
});

test('heartbeat backpressure stops further writes and service close removes every connection listener and timer', async t => {
  const f = fixture(t, { heartbeatMs: 10 });
  const first = connect(f);
  first.res.accept = false;
  await waitFor(() => first.res.frames.some(frame => frame.startsWith(': heartbeat')));
  const count = first.res.frames.length;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(first.res.frames.length, count);
  const second = connect(f);
  assert.equal(first.req.listenerCount('aborted'), 1);
  assert.equal(second.req.listenerCount('aborted'), 1);
  f.stream.close();
  assert.equal(first.req.listenerCount('aborted'), 0);
  assert.equal(second.req.listenerCount('aborted'), 0);
  assert.equal(first.res.listenerCount('drain'), 0);
  assert.equal(second.res.listenerCount('close'), 0);
});

test('rolled back events wake consumers without emitting a phantom sequence', async t => {
  const f = fixture(t);
  const { res, cleanup } = connect(f);
  f.store.db.exec(`CREATE TRIGGER reject_agent_event BEFORE INSERT ON agent_run_events
    WHEN NEW.type='progress' BEGIN SELECT RAISE(ABORT, 'event rejected'); END;`);
  assert.throws(() => f.store.appendEvent({ userId: 'alice', runId: f.run.id, type: 'progress', payload: { message: 'rolled back' } }));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(f.store.listEvents({ userId: 'alice', runId: f.run.id }).length, 1);
  assert.doesNotMatch(res.frames.join(''), /rolled back|id: 2/);
  cleanup();
});
