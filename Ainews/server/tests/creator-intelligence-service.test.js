const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const CreatorIntelligenceService = require('../services/creators/creator-intelligence-service');

const NOW = '2026-08-29T12:00:00.000Z';

test('processing collected posts persists hotness and creator topics for live API ranking', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-intelligence-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  try {
    store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW }]);
    ['a', 'b', 'c'].forEach((suffix, index) => {
      const platform = ['youtube', 'github', 'rss'][index];
      store.upsertCreators([{
        id: `creator-${suffix}`, displayName: `Creator ${suffix}`, kind: 'person',
        reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['ai-tech']
      }]);
      store.upsertAccounts([{
        id: `account-${suffix}`, creatorId: `creator-${suffix}`, platform,
        externalAccountId: `external-${suffix}`, profileUrl: `https://example.com/${suffix}`,
        enabled: true, lastVerifiedAt: NOW, authState: 'not_required'
      }]);
      store.commitPage({
        accountId: `account-${suffix}`,
        posts: [{
          id: `post-${suffix}`, externalPostId: `post-${suffix}`,
          url: `https://example.com/posts/${suffix}`, provenanceUrl: `https://example.com/${suffix}`,
          title: 'OpenAI coding agent 大模型发布实测', text: '人工智能速度、价格和效果对比', contentType: 'post',
          publishedAt: `2026-08-29T${String(8 + index).padStart(2, '0')}:00:00.000Z`, collectedAt: NOW,
          language: 'zh-CN', verticalIds: ['ai-tech'], sourceConfidence: 'official',
          metrics: { likes: 100 + index * 100, comments: 20, shares: 10 }
        }],
        exhausted: true,
        collectedAt: NOW
      });
    });

    const result = new CreatorIntelligenceService({ store, now: () => NOW }).process();
    assert.equal(result.scoredPosts, 3);
    assert.equal(result.topics, 1);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_post_scores').get().count, 3);
    const topic = store.db.prepare('SELECT creator_count, platform_count, formula_version FROM creator_topics').get();
    assert.deepEqual(topic, { creator_count: 3, platform_count: 3, formula_version: 'creator-topic-v1' });
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('processing reclassifies each post from its content and removes an unsupported creator prior', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-intelligence-classify-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  try {
    store.syncVerticals([
      { id: 'beauty', name: '美妆', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW },
      { id: 'entertainment', name: '娱乐', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW },
    ]);
    store.upsertCreators([{ id: 'beauty-creator', displayName: 'Beauty Creator', kind: 'person', reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['beauty'] }]);
    store.upsertAccounts([{ id: 'beauty-account', creatorId: 'beauty-creator', platform: 'youtube', externalAccountId: 'beauty', profileUrl: 'https://example.com/beauty', enabled: true, lastVerifiedAt: NOW, authState: 'not_required' }]);
    store.commitPage({ accountId: 'beauty-account', posts: [{
      id: 'unrelated-post', externalPostId: 'unrelated-post', url: 'https://example.com/unrelated',
      provenanceUrl: 'https://example.com/beauty', title: 'Nicotine Cravings Are Brutal', text: 'Personal life update',
      contentType: 'video', publishedAt: '2026-08-29T11:00:00.000Z', collectedAt: NOW,
      language: 'en', verticalIds: ['beauty'], sourceConfidence: 'official'
    }], exhausted: true, collectedAt: NOW });

    const result = new CreatorIntelligenceService({ store, now: () => NOW }).process();
    assert.equal(result.uncategorizedPosts, 1);
    assert.deepEqual(store.getPost('unrelated-post').verticalIds, []);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_topics').get().count, 0);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('verified specialist media may retain its sole catalog vertical when an individual headline is neutral', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-intelligence-media-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  try {
    store.syncVerticals([{ id: 'fashion', name: '穿搭', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW }]);
    store.upsertCreators([{ id: 'fashion-media', displayName: 'Fashion Media', kind: 'media', reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['fashion'] }]);
    store.upsertAccounts([{ id: 'fashion-feed', creatorId: 'fashion-media', platform: 'rss', externalAccountId: 'fashion-feed', profileUrl: 'https://example.com/fashion', enabled: true, lastVerifiedAt: NOW, authState: 'not_required' }]);
    store.commitPage({ accountId: 'fashion-feed', posts: [{
      id: 'neutral-headline', externalPostId: 'neutral-headline', url: 'https://example.com/headline',
      provenanceUrl: 'https://example.com/fashion', title: 'Ancellm Tokyo Spring 2027', text: '',
      contentType: 'article', publishedAt: '2026-08-29T11:00:00.000Z', collectedAt: NOW,
      language: 'en', verticalIds: ['fashion'], sourceConfidence: 'public'
    }], exhausted: true, collectedAt: NOW });

    const result = new CreatorIntelligenceService({ store, now: () => NOW }).process();
    assert.equal(result.uncategorizedPosts, 0);
    assert.deepEqual(store.getPost('neutral-headline').verticalIds, ['fashion']);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creator_topics').get().count, 1);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('creator service tick runs the intelligence processor after collection', async () => {
  const CreatorService = require('../services/creators/creator-service');
  const calls = [];
  const service = new CreatorService({
    env: { AYA_CREATOR_REQUEST_BUDGET: '2' },
    store: {
      listDueAccounts: () => [],
      scheduleUnscheduledAccounts: () => {},
      syncVerticals: () => {}
    },
    collector: { collectMany: async () => [] },
    backfillService: { runPending: async () => [] },
    processor: { process: () => { calls.push('process'); return { scoredPosts: 0, topics: 0 }; } }
  });
  const result = await service.tick();
  assert.deepEqual(calls, ['process']);
  assert.deepEqual(result.intelligence, { scoredPosts: 0, topics: 0 });
});
