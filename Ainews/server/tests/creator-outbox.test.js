const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const SubscriptionService = require('../services/creators/subscription-service');
const OutboxWorker = require('../services/creators/outbox-worker');

const NOW = '2026-08-29T12:00:00.000Z';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-outbox-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  const subscriptions = new SubscriptionService({ store, now: () => NOW });
  subscriptions.createEndpoint('user-a', { id: 'endpoint-a', type: 'test', destination: 'test://user-a' });
  subscriptions.createSubscription('user-a', {
    id: 'subscription-a', name: '全部即时', deliveryMode: 'immediate', endpointIds: ['endpoint-a'], filters: {}
  });
  store.applyCreatorStateChange({
    producer: 'test', entityType: 'post', entityId: 'post-1', stateVersion: NOW,
    applyState: () => ({ before: null, after: { id: 'post-1' } }),
    detectEvents: () => [{ eventType: 'post.published', entityType: 'post', entityId: 'post-1', transitionBucket: 'inserted', occurredAt: NOW }]
  });
  return { store, close: () => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

test('2xx delivery records an audited attempt and acknowledges the outbox row', async () => {
  const item = fixture();
  try {
    const worker = new OutboxWorker({ store: item.store, now: () => NOW, transports: { test: async () => ({ status: 204 }) } });
    assert.deepEqual(await worker.runOnce(), { claimed: 1, delivered: 1, retried: 0, dead: 0 });
    assert.equal(item.store.db.prepare('SELECT status FROM creator_delivery_outbox').get().status, 'delivered');
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_delivery_attempts').get().count, 1);
  } finally { item.close(); }
});
test('429 Retry-After and 5xx use durable retry schedules while terminal 4xx becomes dead letter', async () => {
  const cases = [
    { status: 429, retryAfter: '120', expected: 'retry', next: '2026-08-29T12:02:00.000Z' },
    { status: 503, expected: 'retry', next: '2026-08-29T12:01:00.000Z' },
    { status: 400, expected: 'dead', next: NOW }
  ];
  for (const scenario of cases) {
    const item = fixture();
    try {
      const worker = new OutboxWorker({ store: item.store, now: () => NOW, transports: { test: async () => scenario } });
      await worker.runOnce();
      const row = item.store.db.prepare('SELECT status, next_attempt_at FROM creator_delivery_outbox').get();
      assert.equal(row.status, scenario.expected);
      assert.equal(row.next_attempt_at, scenario.next);
    } finally { item.close(); }
  }
});

test('a crash after send but before acknowledgment is retried after the lease and manual replay revives dead rows', async () => {
  const item = fixture();
  try {
    let sends = 0;
    const crashing = new OutboxWorker({
      store: item.store, now: () => NOW, leaseMs: 1000,
      transports: { test: async () => { sends += 1; return { status: 200 }; } },
      afterSend: () => { throw new Error('crash_after_send'); }
    });
    await assert.rejects(crashing.runOnce(), /crash_after_send/);
    assert.equal(item.store.db.prepare('SELECT status FROM creator_delivery_outbox').get().status, 'processing');
    const recovered = new OutboxWorker({
      store: item.store, now: () => '2026-08-29T12:00:02.000Z',
      transports: { test: async () => { sends += 1; return { status: 200 }; } }
    });
    await recovered.runOnce();
    assert.equal(sends, 2);
    assert.equal(item.store.db.prepare('SELECT status FROM creator_delivery_outbox').get().status, 'delivered');

    item.store.db.prepare("UPDATE creator_delivery_outbox SET status='dead'").run();
    assert.equal(recovered.replayDead(), 1);
    assert.equal(item.store.db.prepare('SELECT status FROM creator_delivery_outbox').get().status, 'pending');
  } finally { item.close(); }
});
