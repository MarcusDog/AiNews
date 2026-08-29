const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CreatorStore = require('../services/creators/creator-store');
const SubscriptionService = require('../services/creators/subscription-service');
const { buildCreatorTopics, persistCreatorTopics } = require('../services/creators/creator-topic-engine');

function post(id, creatorId, platform, hour, overrides = {}) {
  return {
    id,
    creatorId,
    platform,
    url: `https://${platform}.example/posts/${id}`,
    title: 'OpenAI 发布全新编程 Agent 产品',
    text: '新模型支持自主完成软件开发任务',
    publishedAt: `2026-08-29T${String(hour).padStart(2, '0')}:00:00.000Z`,
    verticalId: 'ai-tech',
    hotness: 60,
    ...overrides
  };
}

test('one viral creator remains a single-creator breakout', () => {
  const [topic] = buildCreatorTopics([
    post('one', 'creator-a', 'youtube', 1, { hotness: 90 }),
    post('two', 'creator-a', 'x', 2, { hotness: 80 })
  ]);
  assert.equal(topic.creatorCount, 1);
  assert.equal(topic.platformCount, 2);
  assert.equal(topic.signals.singleCreatorBreakout, true);
  assert.equal(topic.signals.multiCreatorAdoption, false);
  assert.equal(topic.signals.crossPlatformSpread, false);
});

test('three independent creators within six hours become a multi-creator topic', () => {
  const [topic] = buildCreatorTopics([
    post('a', 'creator-a', 'youtube', 1),
    post('b', 'creator-b', 'youtube', 3),
    post('c', 'creator-c', 'youtube', 5)
  ]);
  assert.equal(topic.creatorCount, 3);
  assert.equal(topic.signals.multiCreatorAdoption, true);
  assert.equal(topic.signals.crossPlatformSpread, false);
  assert.equal(topic.firstAdopter.creatorId, 'creator-a');
  assert.deepEqual(topic.adoptionSequence.map((item) => item.creatorId), ['creator-a', 'creator-b', 'creator-c']);
});

test('same creator cross-posting does not count as independent adoption', () => {
  const [topic] = buildCreatorTopics([
    post('a', 'creator-a', 'youtube', 1),
    post('b', 'creator-a', 'x', 2),
    post('c', 'creator-a', 'bilibili', 3)
  ]);
  assert.equal(topic.creatorCount, 1);
  assert.equal(topic.platformCount, 3);
  assert.equal(topic.signals.multiCreatorAdoption, false);
  assert.equal(topic.signals.crossPlatformSpread, false);
});

test('syndication network copies collapse to one independent adoption', () => {
  const [topic] = buildCreatorTopics([
    post('a', 'media-a', 'rss', 1, { syndicationNetworkId: 'wire-1' }),
    post('b', 'media-b', 'rss', 2, { syndicationNetworkId: 'wire-1' }),
    post('c', 'media-c', 'rss', 3, { syndicationNetworkId: 'wire-1' })
  ]);
  assert.equal(topic.creatorCount, 1);
  assert.equal(topic.adoptionSequence.length, 1);
  assert.equal(topic.adoptionSequence[0].syndicationNetworkId, 'wire-1');
});

test('three creators across two platforms trigger cross-platform spread and every adoption has evidence', () => {
  const [topic] = buildCreatorTopics([
    post('a', 'creator-a', 'youtube', 1),
    post('b', 'creator-b', 'x', 4),
    post('c', 'creator-c', 'youtube', 8)
  ]);
  assert.equal(topic.creatorCount, 3);
  assert.equal(topic.platformCount, 2);
  assert.equal(topic.signals.crossPlatformSpread, true);
  assert.equal(topic.snapshotVersion, 'creator-topic-v1');
  assert(topic.adoptionSequence.every((item) => item.evidenceUrl.startsWith('https://')));
  assert.equal(topic.evidence.length, 3);
});

test('unrelated creator posts do not collapse into the same topic', () => {
  const topics = buildCreatorTopics([
    post('ai', 'creator-a', 'youtube', 1),
    post('beauty', 'creator-b', 'x', 2, {
      title: '夏季防晒霜成分实测与推荐', text: '敏感肌肤护肤指南', verticalId: 'beauty'
    })
  ]);
  assert.equal(topics.length, 2);
});

test('creator topics persist separately with evidence, adoption order and versioned snapshots', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-topic-store-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  try {
    store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'v1', keywords: [], negativeKeywords: [], createdAt: '2026-08-29T00:00:00.000Z' }]);
    const sourcePosts = [post('a', 'creator-a', 'youtube', 1), post('b', 'creator-b', 'x', 3), post('c', 'creator-c', 'youtube', 5)];
    sourcePosts.forEach((item) => {
      store.upsertCreators([{ id: item.creatorId, displayName: item.creatorId, reviewStatus: 'verified', reviewedAt: item.publishedAt, verticalIds: ['ai-tech'] }]);
      store.upsertAccounts([{ id: `account-${item.id}`, creatorId: item.creatorId, platform: item.platform, externalAccountId: `external-${item.id}`, profileUrl: `https://${item.platform}.example/users/${item.creatorId}`, enabled: true, lastVerifiedAt: item.publishedAt, authState: 'not_required' }]);
      store.commitPage({ accountId: `account-${item.id}`, posts: [{
        id: item.id, platform: item.platform, externalPostId: item.id, url: item.url,
        title: item.title, text: item.text, contentType: 'post', publishedAt: item.publishedAt,
        collectedAt: item.publishedAt, language: 'zh-CN', verticalIds: ['ai-tech'],
        sourceConfidence: 'public', provenanceUrl: item.url
      }], exhausted: true, collectedAt: item.publishedAt });
    });
    const topics = buildCreatorTopics(sourcePosts);
    persistCreatorTopics(store, topics, '2026-08-29T06:00:00.000Z');
    const row = store.db.prepare('SELECT creator_count,platform_count,formula_version,payload_json FROM creator_topics').get();
    assert.equal(row.creator_count, 3);
    assert.equal(row.platform_count, 2);
    assert.equal(row.formula_version, 'creator-topic-v1');
    assert.equal(JSON.parse(row.payload_json).evidence.length, 3);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_topic_posts').get().count, 3);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_topic_snapshots').get().count, 1);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('persisting a topic crossing creates durable multi-creator and cross-platform events', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-topic-events-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  try {
    store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'v1', keywords: [], negativeKeywords: [], createdAt: '2026-08-29T00:00:00.000Z' }]);
    const subscriptions = new SubscriptionService({ store, now: () => '2026-08-29T06:00:00.000Z' });
    subscriptions.createEndpoint('user-a', { id: 'endpoint-a', type: 'in_app', destination: 'user-a' });
    subscriptions.createSubscription('user-a', { id: 'subscription-a', name: '扩散提醒', deliveryMode: 'immediate', endpointIds: ['endpoint-a'], filters: {} });
    const sourcePosts = [post('a', 'creator-a', 'youtube', 1), post('b', 'creator-b', 'x', 3), post('c', 'creator-c', 'youtube', 5)];
    for (const item of sourcePosts) {
      store.upsertCreators([{ id: item.creatorId, displayName: item.creatorId, reviewStatus: 'verified', reviewedAt: item.publishedAt, verticalIds: ['ai-tech'] }]);
      store.upsertAccounts([{ id: `account-${item.id}`, creatorId: item.creatorId, platform: item.platform, externalAccountId: `external-${item.id}`, profileUrl: `https://${item.platform}.example/users/${item.creatorId}`, enabled: true, lastVerifiedAt: item.publishedAt, authState: 'not_required' }]);
      store.commitPage({ accountId: `account-${item.id}`, posts: [{
        id: item.id, platform: item.platform, externalPostId: item.id, url: item.url, title: item.title,
        text: item.text, contentType: 'post', publishedAt: item.publishedAt, collectedAt: item.publishedAt,
        language: 'zh-CN', verticalIds: ['ai-tech'], sourceConfidence: 'public', provenanceUrl: item.url
      }], exhausted: true, collectedAt: item.publishedAt });
    }
    persistCreatorTopics(store, buildCreatorTopics(sourcePosts), '2026-08-29T06:00:00.000Z');
    assert.deepEqual(store.db.prepare('SELECT event_type FROM creator_events ORDER BY seq').all().map((row) => row.event_type), [
      'topic.multi_creator', 'topic.cross_platform'
    ]);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_delivery_outbox').get().count, 2);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
