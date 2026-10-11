const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const CreatorStore = require('../services/creators/creator-store');
const { createCreatorStreamRouter } = require('../routes/creator-stream');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-stream-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'stream.db') }).initialize();
  const app = express();
  const requireUser = (req, res, next) => {
    if (req.get('authorization') !== 'Bearer test-user') {
      return res.status(401).json({ success: false, error: 'auth_required' });
    }
    req.authUser = { id: 'user-1' };
    return next();
  };
  app.use('/api/creators/v1/stream', createCreatorStreamRouter({
    store, requireUser, heartbeatMs: 20, batchLimit: 100
  }));
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    store, server, directory,
    url: `http://127.0.0.1:${server.address().port}/api/creators/v1/stream`
  })));
}

function append(store, id, options = {}) {
  return store.appendCreatorEvent({
    id,
    eventType: options.eventType || 'post.hot',
    entityType: options.entityType || 'post',
    entityId: options.entityId || id,
    verticalId: options.verticalId || 'ai-tech',
    platform: options.platform || 'github',
    score: options.score || 88,
    formulaVersion: 'creator-hotness-v1',
    transitionBucket: id,
    occurredAt: options.occurredAt || '2026-08-29T12:00:00.000Z',
    payload: { title: `Event ${id}`, creatorId: options.creatorId || 'creator-1' }
  });
}

async function readUntil(response, predicate, timeoutMs = 1000) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const timeout = setTimeout(() => reader.cancel('timeout'), timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (predicate(text)) break;
    }
    return text;
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
}

test('creator SSE requires authentication, replays committed events in order and heartbeats', async (t) => {
  const item = await fixture();
  t.after(() => { item.server.close(); item.store.close(); fs.rmSync(item.directory, { recursive: true, force: true }); });
  append(item.store, 'event-1');
  append(item.store, 'event-2');

  const denied = await fetch(`${item.url}?since=0`);
  assert.equal(denied.status, 401);

  const response = await fetch(`${item.url}?since=0`, { headers: { authorization: 'Bearer test-user' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const body = await readUntil(response, (text) => text.includes(': heartbeat'));
  assert.match(body, /id: 1\nevent: post\.hot\ndata:/);
  assert.match(body, /id: 2\nevent: post\.hot\ndata:/);
  assert(body.indexOf('id: 1') < body.indexOf('id: 2'));
  assert.match(body, /: heartbeat/);
});

test('creator SSE filters replay and resumes from Last-Event-ID without duplication', async (t) => {
  const item = await fixture();
  t.after(() => { item.server.close(); item.store.close(); fs.rmSync(item.directory, { recursive: true, force: true }); });
  append(item.store, 'event-ai-1', { verticalId: 'ai-tech' });
  append(item.store, 'event-beauty', { verticalId: 'beauty', platform: 'rss' });
  append(item.store, 'event-ai-2', { verticalId: 'ai-tech' });

  const response = await fetch(`${item.url}?since=0&vertical=ai-tech`, {
    headers: { authorization: 'Bearer test-user', 'last-event-id': '1' }
  });
  const body = await readUntil(response, (text) => text.includes('id: 3'));
  assert.doesNotMatch(body, /id: 1\b/);
  assert.doesNotMatch(body, /id: 2\b/);
  assert.match(body, /id: 3\b/);
});

test('creator SSE delivers post-commit live events and reconnects from the last sequence', async (t) => {
  const item = await fixture();
  t.after(() => { item.server.close(); item.store.close(); fs.rmSync(item.directory, { recursive: true, force: true }); });
  append(item.store, 'event-1');
  const response = await fetch(`${item.url}?since=1`, { headers: { authorization: 'Bearer test-user' } });
  setTimeout(() => append(item.store, 'event-2'), 25);
  const first = await readUntil(response, (text) => text.includes('id: 2'));
  assert.match(first, /id: 2\b/);

  append(item.store, 'event-3');
  const resumed = await fetch(item.url, {
    headers: { authorization: 'Bearer test-user', 'last-event-id': '2' }
  });
  const second = await readUntil(resumed, (text) => text.includes('id: 3'));
  assert.doesNotMatch(second, /id: 2\b/);
  assert.match(second, /id: 3\b/);
});

test('creator SSE first-time subscribers tail from the committed end instead of replaying history', async (t) => {
  const item = await fixture();
  t.after(() => { item.server.close(); item.store.close(); fs.rmSync(item.directory, { recursive: true, force: true }); });
  append(item.store, 'historical-1');
  append(item.store, 'historical-2');

  const response = await fetch(item.url, { headers: { authorization: 'Bearer test-user' } });
  setTimeout(() => append(item.store, 'live-3'), 25);
  const body = await readUntil(response, (text) => text.includes('id: 3'));
  assert.doesNotMatch(body, /id: 1\b/);
  assert.doesNotMatch(body, /id: 2\b/);
  assert.match(body, /id: 3\b/);
});

test('creator SSE returns 410 and a filtered resync URL for an expired cursor', async (t) => {
  const item = await fixture();
  t.after(() => { item.server.close(); item.store.close(); fs.rmSync(item.directory, { recursive: true, force: true }); });
  append(item.store, 'event-1', { verticalId: 'ai-tech' });
  append(item.store, 'event-2', { verticalId: 'ai-tech' });
  append(item.store, 'event-3', { verticalId: 'ai-tech' });
  item.store.db.prepare('DELETE FROM creator_events WHERE seq = 1').run();

  const response = await fetch(`${item.url}?since=0&vertical=ai-tech&platform=github`, {
    headers: { authorization: 'Bearer test-user' }
  });
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.error, 'cursor_expired');
  assert.equal(body.resync, '/api/creators/v1/posts?vertical=ai-tech&platform=github');
  assert.equal(body.oldest_cursor, 2);
  assert.equal(body.latest_cursor, 3);
});
