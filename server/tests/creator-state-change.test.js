const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const SubscriptionService = require('../services/creators/subscription-service');
const { detectCreatorEvents } = require('../services/creators/creator-event-detector');

const NOW = '2026-08-29T12:00:00.000Z';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-state-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'vertical-v1', keywords: ['AI'], negativeKeywords: [], createdAt: NOW }]);
  const subscriptions = new SubscriptionService({ store, now: () => NOW });
  subscriptions.createEndpoint('user-a', { id: 'endpoint-a', type: 'in_app', destination: 'user-a' });
  subscriptions.createSubscription('user-a', {
    id: 'subscription-a', name: '全部即时', deliveryMode: 'immediate', endpointIds: ['endpoint-a'], filters: {}
  });
  return { store, close: () => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

function insertTopic(store, topic) {
  store.db.prepare(`
    INSERT INTO creator_topics (
      id, vertical_id, title, summary, first_seen_at, latest_seen_at, hotness,
      formula_version, creator_count, platform_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
    ON CONFLICT(id) DO UPDATE SET hotness=excluded.hotness, creator_count=excluded.creator_count,
      platform_count=excluded.platform_count, latest_seen_at=excluded.latest_seen_at, updated_at=excluded.updated_at
  `).run(topic.id, topic.verticalId, topic.title, NOW, NOW, topic.hotness, 'creator-topic-v1', topic.creatorCount, topic.platformCount, NOW, NOW);
}

test('detector emits only first post, score and topic threshold crossings with stable transition keys', () => {
  const inserted = detectCreatorEvents({ producer: 'collector', entityType: 'post', entityId: 'post-1', stateVersion: NOW, before: null, after: { id: 'post-1', verticalId: 'ai-tech', platform: 'youtube', creatorId: 'creator-a', score: 0, historical: false } });
  const historical = detectCreatorEvents({ producer: 'collector', entityType: 'post', entityId: 'post-2', stateVersion: NOW, before: null, after: { id: 'post-2', historical: true } });
  const hot = detectCreatorEvents({ producer: 'hotness', entityType: 'post', entityId: 'post-1', stateVersion: NOW, before: { score: 74 }, after: { score: 76, verticalId: 'ai-tech' } });
  const unchanged = detectCreatorEvents({ producer: 'hotness', entityType: 'post', entityId: 'post-1', stateVersion: NOW, before: { score: 76 }, after: { score: 80 } });
  const spread = detectCreatorEvents({ producer: 'topic-engine', entityType: 'topic', entityId: 'topic-1', stateVersion: NOW, before: { creatorCount: 2, platformCount: 1 }, after: { creatorCount: 3, platformCount: 2, verticalId: 'ai-tech', hotness: 88 } });
  assert.deepEqual(inserted.map((event) => event.eventType), ['post.published']);
  assert.deepEqual(historical, []);
  assert.deepEqual(hot.map((event) => event.transitionBucket), ['score:75']);
  assert.deepEqual(unchanged, []);
  assert.deepEqual(spread.map((event) => event.eventType), ['topic.multi_creator', 'topic.cross_platform']);
});

test('state, event and outbox commit atomically and duplicate producer retries stay idempotent', () => {
  const item = fixture();
  try {
    const change = () => item.store.applyCreatorStateChange({
      producer: 'topic-engine', entityType: 'topic', entityId: 'topic-1', stateVersion: NOW,
      applyState: () => {
        const before = item.store.getCreatorTopic('topic-1');
        insertTopic(item.store, { id: 'topic-1', verticalId: 'ai-tech', title: 'Agent 扩散', hotness: 88, creatorCount: 3, platformCount: 2 });
        return { before, after: item.store.getCreatorTopic('topic-1') };
      },
      detectEvents: detectCreatorEvents
    });
    const first = change();
    const second = change();
    assert.deepEqual(first.events.map((event) => event.eventType), ['topic.multi_creator', 'topic.cross_platform']);
    assert.equal(second.events.length, 0);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_topics').get().count, 1);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_events').get().count, 2);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_delivery_outbox').get().count, 2);
  } finally { item.close(); }
});

test('failures after state mutation or event insertion roll back state, event and outbox together', () => {
  const item = fixture();
  try {
    assert.throws(() => item.store.applyCreatorStateChange({
      producer: 'topic-engine', entityType: 'topic', entityId: 'topic-fail-detect', stateVersion: NOW,
      applyState: () => {
        insertTopic(item.store, { id: 'topic-fail-detect', verticalId: 'ai-tech', title: '失败主题', hotness: 80, creatorCount: 3, platformCount: 2 });
        return { before: null, after: item.store.getCreatorTopic('topic-fail-detect') };
      },
      detectEvents: () => { throw new Error('detector_failed'); }
    }), /detector_failed/);
    assert.equal(item.store.getCreatorTopic('topic-fail-detect'), null);

    const original = item.store.resolveSubscriptionDeliveries;
    item.store.resolveSubscriptionDeliveries = () => { throw new Error('outbox_failed'); };
    assert.throws(() => item.store.applyCreatorStateChange({
      producer: 'topic-engine', entityType: 'topic', entityId: 'topic-fail-outbox', stateVersion: NOW,
      applyState: () => {
        insertTopic(item.store, { id: 'topic-fail-outbox', verticalId: 'ai-tech', title: '失败主题 2', hotness: 80, creatorCount: 3, platformCount: 2 });
        return { before: null, after: item.store.getCreatorTopic('topic-fail-outbox') };
      }, detectEvents: detectCreatorEvents
    }), /outbox_failed/);
    item.store.resolveSubscriptionDeliveries = original;
    assert.equal(item.store.getCreatorTopic('topic-fail-outbox'), null);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_events').get().count, 0);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_delivery_outbox').get().count, 0);
  } finally { item.close(); }
});
