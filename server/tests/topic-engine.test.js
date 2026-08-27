const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildTopics, scoreTrend } = require('../services/signals/topic-engine');
const SignalStore = require('../services/signals/signal-store');
const SignalService = require('../services/signals/signal-service');
const { normalizeSignal } = require('../services/signals/signal-normalizer');

function signal(id, overrides = {}) {
  return {
    id,
    fingerprint: id,
    externalId: id,
    sourceId: `source-${id}`,
    sourceName: `Source ${id}`,
    sourceTrustClass: 'community_api',
    platform: 'hackernews',
    region: 'global',
    kind: 'discussion',
    title: `Signal ${id}`,
    summary: null,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    publishedAt: '2026-08-27T10:00:00.000Z',
    firstSeenAt: '2026-08-27T10:00:00.000Z',
    metrics: {},
    tags: [],
    repoFullName: null,
    ...overrides
  };
}

test('clusters bilingual same-event evidence and shared URLs but keeps generic AI stories separate', () => {
  const items = [
    signal('cn', {
      sourceId: 'weibo', platform: 'weibo', region: 'cn',
      title: 'OpenAI 正式发布 GPT-6 API',
      canonicalUrl: 'https://openai.com/gpt-6', url: 'https://openai.com/gpt-6'
    }),
    signal('en', {
      sourceId: 'github', platform: 'github', kind: 'repository',
      title: 'OpenAI launches the GPT-6 API',
      canonicalUrl: 'https://github.com/openai/gpt-6', url: 'https://github.com/openai/gpt-6'
    }),
    signal('same-url', {
      sourceId: 'reddit', platform: 'reddit', title: 'Developers discuss migration details',
      canonicalUrl: 'https://openai.com/gpt-6', url: 'https://openai.com/gpt-6'
    }),
    signal('generic-one', { title: 'AI changes school homework', url: 'https://news.example/school', canonicalUrl: 'https://news.example/school' }),
    signal('generic-two', { title: 'AI chip factory opens', url: 'https://news.example/chips', canonicalUrl: 'https://news.example/chips' })
  ];

  const topics = buildTopics(items, { now: '2026-08-27T12:00:00.000Z' }).topics;
  const launch = topics.find((topic) => topic.signalIds.includes('cn'));

  assert.deepEqual(new Set(launch.signalIds), new Set(['cn', 'en', 'same-url']));
  assert(launch.clusterReasons.includes('shared_url'));
  assert(launch.clusterReasons.some((reason) => reason.startsWith('entity:')));
  assert.equal(topics.filter((topic) => topic.signalIds.some((id) => id.startsWith('generic'))).length, 2);
});

test('window boundary, initial anchor IDs and output are deterministic independent of input order', () => {
  const repo = signal('repo', {
    title: 'Acme AI toolkit', kind: 'repository', platform: 'github',
    repoFullName: 'Acme/Toolkit', publishedAt: '2026-08-25T12:00:00.000Z'
  });
  const old = signal('old', { publishedAt: '2026-08-24T11:59:59.000Z' });
  const expectedId = crypto.createHash('sha256').update('aya-topic-v1:repo:acme/toolkit').digest('hex').slice(0, 24);

  const forward = buildTopics([repo, old], { now: '2026-08-27T12:00:00.000Z', windowHours: 72 });
  const reverse = buildTopics([old, repo], { now: '2026-08-27T12:00:00.000Z', windowHours: 72 });

  assert.equal(forward.topics.length, 1);
  assert.equal(forward.topics[0].anchor, 'repo:acme/toolkit');
  assert.equal(forward.topics[0].id, expectedId);
  assert.deepEqual(reverse, forward);
});

test('rebuild reuses stable identities, emits merge aliases, and preserves anchor child on split', () => {
  const mergedSignals = [
    signal('a', { title: 'OpenAI GPT-6 API released', canonicalUrl: 'https://openai.com/gpt-6', url: 'https://openai.com/gpt-6' }),
    signal('b', { title: 'OpenAI launches GPT-6 API', canonicalUrl: 'https://example.com/gpt6', url: 'https://example.com/gpt6' }),
    signal('c', { title: 'OpenAI GPT-6 API developer reaction', canonicalUrl: 'https://example.com/reaction', url: 'https://example.com/reaction' })
  ];
  const merged = buildTopics(mergedSignals, {
    now: '2026-08-27T12:00:00.000Z',
    existingTopics: [
      { id: 'topic-z', anchor: 'signal:a', title: 'OpenAI GPT-6', signalIds: ['a', 'c'] },
      { id: 'topic-a', anchor: 'signal:b', title: 'OpenAI GPT-6', signalIds: ['b', 'c'] }
    ]
  });
  assert.equal(merged.topics[0].id, 'topic-a');
  assert.deepEqual(merged.aliases, [{ aliasId: 'topic-z', canonicalId: 'topic-a', reason: 'merge' }]);

  const split = buildTopics([
    signal('repo-core', { title: 'Acme toolkit release', kind: 'repository', repoFullName: 'acme/toolkit' }),
    signal('other', { title: 'DeepSeek education policy', canonicalUrl: 'https://example.com/policy', url: 'https://example.com/policy' })
  ], {
    now: '2026-08-27T12:00:00.000Z',
    existingTopics: [{
      id: 'topic-old', anchor: 'repo:acme/toolkit', title: 'Old combined topic', signalIds: ['repo-core', 'other']
    }]
  });
  assert.equal(split.topics.find((topic) => topic.signalIds.includes('repo-core')).id, 'topic-old');
  assert.notEqual(split.topics.find((topic) => topic.signalIds.includes('other')).id, 'topic-old');
});

test('trend-v1 follows the frozen formula and exposes raw inputs and direction', () => {
  const items = [
    signal('current', {
      sourceId: 'github', sourceTrustClass: 'official', platform: 'github', kind: 'repository',
      repoFullName: 'acme/tool', publishedAt: '2026-08-27T10:00:00.000Z',
      metrics: { likes: 10, comments: 2, shares: 1, views: 1000, stars: 100, forks: 10, openIssues: 5 }
    }),
    signal('previous', {
      sourceId: 'reddit', sourceTrustClass: 'public_feed', platform: 'reddit',
      publishedAt: '2026-08-26T06:00:00.000Z', metrics: { comments: 3, shares: 2, points: 50 }
    })
  ];
  const result = scoreTrend(items, {
    now: '2026-08-27T12:00:00.000Z',
    firstSeenAt: '2026-08-26T06:00:00.000Z',
    previousSnapshot: { formulaVersion: 'trend-v1', trendScore: 60 }
  });

  assert.equal(result.formulaVersion, 'trend-v1');
  assert.equal(result.scoreBreakdown.freshness, 25);
  assert.equal(result.scoreBreakdown.engagement, 13.49);
  assert.equal(result.scoreBreakdown.momentum, 14);
  assert.equal(result.scoreBreakdown.diversity, 10);
  assert.equal(result.scoreBreakdown.trust, 8);
  assert.equal(result.scoreBreakdown.project, 2.67);
  assert.equal(result.trendScore, 73);
  assert.equal(result.trendDirection, 'rising');
  assert.deepEqual(result.rawInputs.windowCounts, { current24h: 1, previous24h: 1, total72h: 2 });
  assert.equal(result.rawInputs.metrics.stars, 100);
  assert.equal(Object.hasOwn(result.rawInputs.metrics, 'reposts'), false);
});

test('direction comparison ignores snapshot scores from another formula version', () => {
  const item = signal('older', {
    publishedAt: '2026-08-26T06:00:00.000Z', firstSeenAt: '2026-08-25T00:00:00.000Z'
  });
  const result = scoreTrend([item], {
    now: '2026-08-27T12:00:00.000Z',
    firstSeenAt: '2026-08-25T00:00:00.000Z',
    previousSnapshot: { formulaVersion: 'trend-v0', trendScore: 100 }
  });
  assert.equal(result.trendDirection, 'cooling');
  assert.equal(result.whatChanged.previousComparableScore, null);
  assert.deepEqual(result.rawInputs.metrics, {});
});

test('SignalService rebuild persists topics, evidence relations and comparable snapshots', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-topic-service-'));
  const catalog = [{
    id: 'github', name: 'GitHub', tier: 'L1', platform: 'github', region: 'global',
    mode: 'api', adapter: 'github', trustClass: 'official', timeoutMs: 1000,
    configured: true, enabled: true, schedulable: true
  }];
  const store = new SignalStore({ dbPath: path.join(directory, 'signals.db') });
  const service = new SignalService({ catalog, store, collector: { collectAll: async () => ({ status: 'success' }) } });
  try {
    service.initialize();
    store.upsertSignals([normalizeSignal({
      externalId: 'acme', title: 'Acme AI toolkit', kind: 'repository',
      url: 'https://github.com/acme/toolkit', repoFullName: 'acme/toolkit',
      publishedAt: '2026-08-27T10:00:00.000Z', metrics: { stars: 50 }
    }, catalog[0], { now: '2026-08-27T11:00:00.000Z' })]);

    const first = service.rebuildTopics({ now: '2026-08-27T12:00:00.000Z' });
    const second = service.rebuildTopics({ now: '2026-08-27T13:00:00.000Z' });
    const listed = store.listTopics({ now: '2026-08-27T13:00:00.000Z' });
    const detail = store.getTopic(listed[0].id);

    assert.equal(first.topicCount, 1);
    assert.equal(second.topicCount, 1);
    assert.equal(first.topics[0].id, second.topics[0].id);
    assert.equal(listed.length, 1);
    assert.equal(detail.signals.length, 1);
    assert.equal(detail.opportunity.formulaVersion, 'opportunity-v2');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM topic_snapshots').get().count, 2);
  } finally {
    service.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SignalService projects persisted topics onto 24h, 48h and 72h evidence windows', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-topic-windows-'));
  const catalog = [{
    id: 'reddit', name: 'Reddit', tier: 'L1', platform: 'reddit', region: 'global',
    mode: 'rss', adapter: 'rss-signal', trustClass: 'public_feed', timeoutMs: 1000,
    configured: true, enabled: true, schedulable: true
  }];
  const store = new SignalStore({ dbPath: path.join(directory, 'signals.db') });
  const service = new SignalService({ catalog, store, collector: { collectAll: async () => ({ status: 'success' }) } });
  const now = '2026-08-27T12:00:00.000Z';
  try {
    service.initialize();
    store.upsertSignals([
      normalizeSignal({ externalId: '12h', title: 'Qwen launch discussion', kind: 'discussion', url: 'https://qwen.example/launch', publishedAt: '2026-08-27T00:00:00.000Z', metrics: { comments: 30 } }, catalog[0], { now }),
      normalizeSignal({ externalId: '36h', title: 'Qwen launch discussion', kind: 'discussion', url: 'https://qwen.example/launch', publishedAt: '2026-08-26T00:00:00.000Z', metrics: { comments: 10 } }, catalog[0], { now }),
      normalizeSignal({ externalId: '60h', title: 'Qwen launch discussion', kind: 'discussion', url: 'https://qwen.example/launch', publishedAt: '2026-08-25T00:00:00.000Z', metrics: { comments: 4 } }, catalog[0], { now })
    ]);
    service.rebuildTopics({ now, windowHours: 72 });

    const day = service.listTopics({ now, windowHours: 24, limit: 10 });
    const twoDays = service.listTopics({ now, windowHours: 48, limit: 10 });
    const threeDays = service.listTopics({ now, windowHours: 72, limit: 10 });
    const detail = service.getTopic(day[0].id, { now, windowHours: 24 });

    assert.equal(day[0].id, twoDays[0].id);
    assert.equal(twoDays[0].id, threeDays[0].id);
    assert.deepEqual([day[0].evidenceCount, twoDays[0].evidenceCount, threeDays[0].evidenceCount], [1, 2, 3]);
    assert.equal(new Set([day[0].trendScore, twoDays[0].trendScore, threeDays[0].trendScore]).size > 1, true);
    assert.deepEqual(detail.signals.map((item) => item.externalId), ['12h']);
  } finally {
    service.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
