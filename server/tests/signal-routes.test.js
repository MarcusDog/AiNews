const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createSignalsRouter } = require('../routes/signals');

const METRICS = {
  views: 100, likes: 3, comments: 2, replies: null, shares: 1, reposts: null,
  stars: 20, forks: 2, openIssues: 1, points: null, rank: null, downloads: null
};

function topic() {
  return {
    id: 'topic-1', canonicalTopicId: 'topic-1', anchor: 'repo:acme/tool',
    title: 'Acme AI Tool', summary: 'Real topic', firstSeenAt: '2026-08-27T00:00:00.000Z',
    latestSeenAt: '2026-08-27T01:00:00.000Z', trendScore: 72, creatorScore: 68,
    trendDirection: 'rising', evidenceStrength: 'cross-platform', formulaVersion: 'trend-v1',
    scoreBreakdown: { freshness: 25 },
    opportunity: {
      formulaVersion: 'opportunity-v1', creatorScore: 68,
      angles: [{ audience: 'creator', title: '实测 Acme AI Tool', angle: '验证安装过程' }],
      riskNotes: []
    },
    clusterReasons: ['shared_repository'], evidenceCount: 2,
    signals: [{
      id: 'signal-1', sourceId: 'github', sourceName: 'GitHub', sourceTrustClass: 'official',
      platform: 'github', region: 'global', kind: 'repository', title: 'Acme AI Tool',
      summary: 'Source evidence', url: 'https://github.com/acme/tool', canonicalUrl: 'https://github.com/acme/tool',
      author: 'acme', language: 'en', publishedAt: '2026-08-27T01:00:00.000Z',
      metrics: METRICS, tags: ['ai'], repoFullName: 'acme/tool', rawJson: '{"secret":"must not leak"}'
    }]
  };
}

function fakeService(overrides = {}) {
  return {
    listTopics: () => [topic()],
    getTopic: () => topic(),
    listSources: () => [{
      id: 'github', name: 'GitHub', tier: 'L1', platform: 'github', region: 'global',
      mode: 'api', trustClass: 'official', configured: true, enabled: true, schedulable: true,
      status: 'online', setupHint: null, lastAttemptAt: '2026-08-27T01:00:00.000Z',
      lastSuccessAt: '2026-08-27T01:00:00.000Z', lastError: null, failureCount: 0,
      lastReceived: 2, lastSaved: 2
    }],
    listChanges: () => ({
      expired: false, items: [{ seq: 4, topicId: 'topic-1', changeType: 'new', changedAt: '2026-08-27T01:00:00.000Z', payload: {} }],
      nextCursor: 4, oldestCursor: 4, latestCursor: 4
    }),
    refreshAll: async () => ({ collection: { status: 'success', saved: 2 }, rebuild: { topicCount: 1 } }),
    ...overrides
  };
}

async function withServer(service, run, options = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/signals/v1', createSignalsRouter({
    service,
    adminKey: options.adminKey,
    random: options.random || (() => 0)
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('topic list validates windows and returns a stable paginated envelope', async () => {
  const calls = [];
  await withServer(fakeService({ listTopics: (options) => { calls.push(options); return [topic()]; } }), async (origin) => {
    const response = await fetch(`${origin}/api/signals/v1/topics?window=48h&page=2&limit=10`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.items[0].id, 'topic-1');
    assert.deepEqual(payload.meta, { window: '48h', page: 2, limit: 10, count: 1 });
    assert.deepEqual(calls[0], { windowHours: 48, limit: 10, offset: 10 });

    const invalid = await fetch(`${origin}/api/signals/v1/topics?window=7d`);
    assert.equal(invalid.status, 400);
  });
});

test('topic detail resolves canonical aliases and exposes original evidence without raw payloads', async () => {
  const calls = [];
  await withServer(fakeService({
    getTopic: (id, options) => { calls.push({ id, options }); return ({ ...topic(), canonicalTopicId: 'topic-1' }); }
  }), async (origin) => {
    const response = await fetch(`${origin}/api/signals/v1/topics/topic-old?window=24h`);
    const payload = await response.json();
    assert.equal(payload.data.canonical_topic_id, 'topic-1');
    assert.equal(payload.data.signals[0].url, 'https://github.com/acme/tool');
    assert.equal(payload.data.signals[0].metrics.replies, null);
    assert.equal('rawJson' in payload.data.signals[0], false);
    assert.deepEqual(calls, [{ id: 'topic-old', options: { windowHours: 24 } }]);
  });
});

test('unknown topics return 404 and empty topic lists stay honest', async () => {
  await withServer(fakeService({ listTopics: () => [], getTopic: () => null }), async (origin) => {
    const empty = await fetch(`${origin}/api/signals/v1/topics`).then((response) => response.json());
    assert.deepEqual(empty.data.items, []);
    const missing = await fetch(`${origin}/api/signals/v1/topics/missing`);
    assert.equal(missing.status, 404);
  });
});

test('opportunity list and random endpoint use persisted topics only', async () => {
  await withServer(fakeService(), async (origin) => {
    const list = await fetch(`${origin}/api/signals/v1/opportunities?window=24h`).then((response) => response.json());
    const random = await fetch(`${origin}/api/signals/v1/opportunities/random?window=72h`).then((response) => response.json());
    assert.equal(list.data.items[0].topic_id, 'topic-1');
    assert.equal(list.data.items[0].id, 'topic-1');
    assert.equal(list.data.items[0].creator_score, 68);
    assert.equal(random.data.topic_id, 'topic-1');
    assert.equal(random.data.id, 'topic-1');
    assert.equal(random.data.opportunity.formulaVersion, 'opportunity-v1');
  });
});

test('opportunity routes pass creator profile and random exclusion to the service', async () => {
  const calls = [];
  const second = { ...topic(), id: 'topic-2', title: 'Second creator topic', creatorScore: 70 };
  await withServer(fakeService({
    listCreatorOpportunities: (options) => { calls.push(options); return options.exclude === 'topic-1' ? [second] : [topic(), second]; }
  }), async (origin) => {
    const list = await fetch(`${origin}/api/signals/v1/opportunities?window=48h&profile=short-video&limit=10`).then((response) => response.json());
    const random = await fetch(`${origin}/api/signals/v1/opportunities/random?window=48h&profile=short-video&exclude=topic-1`).then((response) => response.json());
    const invalid = await fetch(`${origin}/api/signals/v1/opportunities?profile=philosopher`);

    assert.deepEqual(list.data.items.map((item) => item.topic_id), ['topic-2', 'topic-1']);
    assert.equal(random.data.topic_id, 'topic-2');
    assert.equal(random.data.id, 'topic-2');
    assert.equal(calls[0].profile, 'short-video');
    assert.equal(calls[1].exclude, 'topic-1');
    assert.equal(invalid.status, 400);
  });
});

test('sources and health distinguish configured capability from observed status', async () => {
  await withServer(fakeService(), async (origin) => {
    const sources = await fetch(`${origin}/api/signals/v1/sources`).then((response) => response.json());
    const health = await fetch(`${origin}/api/signals/v1/health`).then((response) => response.json());
    assert.equal(sources.data.items[0].configured, true);
    assert.equal(sources.data.items[0].status, 'online');
    assert.deepEqual(health.data.summary, { total: 1, online: 1, degraded: 0, offline: 0, unconfigured: 0, disabled: 0, pending: 0 });
  });
});

test('changes cursor returns 410 resync metadata when retention expired it', async () => {
  await withServer(fakeService({
    listChanges: () => ({ expired: true, items: [], nextCursor: 9, oldestCursor: 7, latestCursor: 9 })
  }), async (origin) => {
    const response = await fetch(`${origin}/api/signals/v1/changes?since=1`);
    const payload = await response.json();
    assert.equal(response.status, 410);
    assert.deepEqual(payload, {
      success: false, error: 'cursor_expired', resync: '/api/signals/v1/topics',
      oldest_cursor: 7, latest_cursor: 9
    });
  });
});

test('admin refresh requires configured key, rejects missing/wrong keys, and refreshes on success', async () => {
  let refreshes = 0;
  const service = fakeService({ refreshAll: async () => { refreshes += 1; return { ok: true }; } });
  await withServer(service, async (origin) => {
    const missing = await fetch(`${origin}/api/signals/v1/admin/refresh`, { method: 'POST' });
    const wrong = await fetch(`${origin}/api/signals/v1/admin/refresh`, {
      method: 'POST', headers: { 'x-admin-api-key': 'wrong' }
    });
    const valid = await fetch(`${origin}/api/signals/v1/admin/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-api-key': 'correct' },
      body: JSON.stringify({ refreshLegacy: true })
    });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 403);
    assert.equal(valid.status, 200);
    assert.equal(refreshes, 1);
  }, { adminKey: 'correct' });
});

test('admin refresh reports 503 when no server-side management key is configured', async () => {
  await withServer(fakeService(), async (origin) => {
    const response = await fetch(`${origin}/api/signals/v1/admin/refresh`, { method: 'POST' });
    assert.equal(response.status, 503);
  });
});
