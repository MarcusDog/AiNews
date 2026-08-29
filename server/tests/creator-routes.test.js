const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const { createCreatorsRouter } = require('../routes/creators');

const NOW = '2026-08-29T12:00:00.000Z';

function makeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-routes-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  store.syncVerticals([
    { id: 'ai-tech', name: 'AI 科技', version: 'vertical-v1', keywords: ['AI'], negativeKeywords: [], createdAt: NOW },
    { id: 'beauty', name: '美妆', version: 'vertical-v1', keywords: ['护肤'], negativeKeywords: [], createdAt: NOW }
  ]);
  store.upsertCreators([
    { id: 'creator-a', displayName: 'Alice AI', kind: 'person', reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['ai-tech'] },
    { id: 'creator-b', displayName: '美妆实验室', kind: 'brand', reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['beauty'] }
  ]);
  store.upsertAccounts([
    {
      id: 'account-a', creatorId: 'creator-a', platform: 'youtube', externalAccountId: 'UC_A',
      handle: '@alice', profileUrl: 'https://www.youtube.com/channel/UC_A', region: 'global',
      sourceTier: 'L1', enabled: true, lastVerifiedAt: NOW, authState: 'not_required',
      backfillState: 'running', nextCursor: 'private-cursor-a', nextRunAt: NOW
    },
    {
      id: 'account-b', creatorId: 'creator-b', platform: 'x', externalAccountId: 'x-42',
      handle: '@beauty-lab', profileUrl: 'https://x.com/beauty-lab', region: 'cn',
      sourceTier: 'L2', enabled: true, lastVerifiedAt: NOW, authState: 'authorized',
      backfillState: 'partial', historyLimitReason: 'official_history_window', nextRunAt: NOW
    }
  ]);
  const posts = [
    {
      id: 'post-ai-3', accountId: 'account-a', platform: 'youtube', externalPostId: 'video-3',
      url: 'https://www.youtube.com/watch?v=video-3', title: 'Agent workflow benchmark',
      text: 'OpenAI agent coding workflow with a reproducible demo', contentType: 'video',
      publishedAt: '2026-08-29T11:00:00.000Z', collectedAt: NOW, language: 'en', verticalIds: ['ai-tech'],
      sourceConfidence: 'official', provenanceUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_A',
      metrics: { capturedAt: NOW, views: 1000, likes: 80, comments: 15, shares: null, bookmarks: null, platformRank: null, followersAtCapture: 10000 }
    },
    {
      id: 'post-ai-2', accountId: 'account-a', platform: 'youtube', externalPostId: 'video-2',
      url: 'https://www.youtube.com/watch?v=video-2', title: '中文 AI 工具实测',
      text: '开发者使用 AI Agent 智能体完成代码审查', contentType: 'video',
      publishedAt: '2026-08-29T10:00:00.000Z', collectedAt: NOW, language: 'zh-CN', verticalIds: ['ai-tech'],
      sourceConfidence: 'public', provenanceUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_A'
    },
    {
      id: 'post-beauty-1', accountId: 'account-b', platform: 'x', externalPostId: 'tweet-1',
      url: 'https://x.com/beauty-lab/status/1', title: '夏季防晒成分实测',
      text: '敏感肌护肤与防晒产品对比', contentType: 'post',
      publishedAt: '2026-08-29T09:00:00.000Z', collectedAt: NOW, language: 'zh-CN', verticalIds: ['beauty'],
      sourceConfidence: 'authorized', provenanceUrl: 'https://api.x.com/2/users/x-42/tweets'
    }
  ];
  store.commitPage({ accountId: 'account-a', posts: posts.slice(0, 2), exhausted: true, collectedAt: NOW });
  store.commitPage({ accountId: 'account-b', posts: posts.slice(2), exhausted: true, collectedAt: NOW });
  store.recordHotnessScore('post-ai-3', {
    formulaVersion: 'creator-hotness-v1', score: 88, unroundedScore: 88.4, confidence: 'high',
    inputs: { views: 1000 }, components: { velocity: 30 }, penalties: {}
  }, NOW);
  store.recordHotnessScore('post-ai-2', {
    formulaVersion: 'creator-hotness-v1', score: 72, unroundedScore: 71.6, confidence: 'medium',
    inputs: {}, components: {}, penalties: {}
  }, NOW);
  store.db.prepare(`
    INSERT INTO creator_topics (
      id, vertical_id, title, summary, first_seen_at, latest_seen_at, hotness,
      formula_version, creator_count, platform_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'topic-agent', 'ai-tech', 'Agent workflow benchmark', '多位创作者开始讨论 Agent workflow',
    '2026-08-29T09:00:00.000Z', '2026-08-29T11:00:00.000Z', 88,
    'creator-topic-v1', 3, 2,
    JSON.stringify({ evidence: [{ postId: 'post-ai-3', url: 'https://www.youtube.com/watch?v=video-3' }], secret: 'must-not-leak' }),
    NOW, NOW
  );
  store.db.prepare(
    'INSERT INTO creator_topic_posts (topic_id, post_id, adopted_at) VALUES (?, ?, ?)'
  ).run('topic-agent', 'post-ai-3', '2026-08-29T11:00:00.000Z');
  store.updateBackfill('account-a', {
    state: 'running', nextCursor: 'history-page-2', oldestFetchedAt: '2026-06-01T00:00:00.000Z',
    newestFetchedAt: '2026-08-29T11:00:00.000Z', pagesFetched: 4, itemsFetched: 120, updatedAt: NOW
  });

  const calls = { refresh: 0, backfill: 0 };
  const service = {
    tick: async () => { calls.refresh += 1; return { status: 'success', collected: 3 }; },
    backfillService: {
      runAccount: async (account, options) => {
        calls.backfill += 1;
        return { status: 'running', accountId: account.id, force: options.force === true };
      }
    }
  };
  const sourceRegistry = {
    list: () => [
      { id: 'youtube-atom', platform: 'youtube', tier: 'L1', configured: true, schedulable: true, status: 'online', lastSuccessAt: NOW, secretRef: 'env:YOUTUBE_SECRET' },
      { id: 'x-user-timeline', platform: 'x', tier: 'L2', configured: true, schedulable: true, status: 'online', credentialLabel: 'X_BEARER_TOKEN', token: 'must-not-leak' }
    ]
  };
  return {
    directory, store, service, sourceRegistry, calls,
    close() { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

async function withServer(fixture, run, options = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/creators/v1', createCreatorsRouter({
    store: fixture.store,
    service: fixture.service,
    sourceRegistry: fixture.sourceRegistry,
    adminKey: options.adminKey === undefined ? 'correct-key' : options.adminKey,
    requireUser: options.requireUser,
    now: () => NOW
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

async function json(origin, pathname, options) {
  const response = await fetch(origin + '/api/creators/v1' + pathname, options);
  return { response, payload: await response.json() };
}

function assertMetadata(payload) {
  assert.equal(payload.success, true);
  assert.equal(payload.meta.generatedAt, NOW);
  assert.equal(typeof payload.meta.sourceCoverage, 'object');
  assert.equal(typeof payload.meta.formulaVersion, 'object');
  assert.equal(typeof payload.meta.evidenceBoundary, 'string');
}

test('public creator endpoints expose verticals, filtered creators and account backfill coverage', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const verticals = await json(origin, '/verticals');
      const creators = await json(origin, '/creators?vertical=ai-tech&platform=youtube&status=verified&limit=1');
      const detail = await json(origin, '/creators/creator-a');
      const posts = await json(origin, '/creators/creator-a/posts?since=2026-08-29T00:00:00.000Z&limit=1');
      assert.deepEqual(verticals.payload.data.items.map((item) => item.id), ['ai-tech', 'beauty']);
      assert.deepEqual(creators.payload.data.items.map((item) => item.id), ['creator-a']);
      assert.equal(detail.payload.data.accounts[0].backfill.state, 'running');
      assert.equal(detail.payload.data.accounts[0].backfill.pagesFetched, 4);
      assert.equal('nextCursor' in detail.payload.data.accounts[0], false);
      assert.equal(posts.payload.data.items.length, 1);
      assertMetadata(detail.payload);
    });
  } finally { fixture.close(); }
});

test('post keyset pagination is stable without q and search pagination uses FTS rank', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const first = await json(origin, '/posts?limit=1');
      const second = await json(origin, `/posts?limit=1&cursor=${encodeURIComponent(first.payload.data.next_cursor)}`);
      assert.deepEqual(first.payload.data.items.map((item) => item.id), ['post-ai-3']);
      assert.deepEqual(second.payload.data.items.map((item) => item.id), ['post-ai-2']);
      assert.notEqual(first.payload.data.items[0].id, second.payload.data.items[0].id);

      const searchFirst = await json(origin, '/posts?q=Agent&limit=1');
      assert.equal(searchFirst.payload.data.items[0].id, 'post-ai-3');
      assert.equal(Number.isFinite(searchFirst.payload.data.items[0].searchRank), true);
      assertMetadata(searchFirst.payload);
    });
  } finally { fixture.close(); }
});

test('FTS accepts Unicode and treats quotes/operators/injection attempts as bound literal input', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const unicode = await json(origin, '/posts?q=智能体');
      const operators = await json(origin, `/posts?q=${encodeURIComponent('Agent OR "workflow" NOT beauty')}`);
      const injection = await json(origin, `/posts?q=${encodeURIComponent('"; DROP TABLE creator_posts; --')}`);
      assert.deepEqual(unicode.payload.data.items.map((item) => item.id), ['post-ai-2']);
      assert.equal(operators.response.status, 200);
      assert.equal(injection.response.status, 200);
      assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count, 3);

      const empty = await json(origin, '/posts?q=');
      const tooLong = await json(origin, `/posts?q=${'a'.repeat(201)}`);
      assert.equal(empty.response.status, 400);
      assert.equal(tooLong.response.status, 400);
    });
  } finally { fixture.close(); }
});

test('post deletion removes the relational row and FTS row in one transaction', () => {
  const fixture = makeFixture();
  try {
    assert.deepEqual(fixture.store.queryPosts({ q: 'workflow' }).items.map((item) => item.id), ['post-ai-3']);
    assert.equal(fixture.store.deletePosts(['post-ai-3']), 1);
    assert.deepEqual(fixture.store.queryPosts({ q: 'workflow' }).items, []);
    assert.equal(fixture.store.getPost('post-ai-3'), null);
    assert.equal(fixture.store.db.prepare(
      'SELECT COUNT(*) AS count FROM creator_posts_fts WHERE post_id = ?'
    ).get('post-ai-3').count, 0);
  } finally { fixture.close(); }
});

test('opaque cursors are rejected when reused with a different normalized query or filter', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const first = await json(origin, '/posts?q=Agent&limit=1');
      const mismatch = await json(origin, `/posts?q=护肤&limit=1&cursor=${encodeURIComponent(first.payload.data.next_cursor)}`);
      const filterMismatch = await json(origin, `/posts?q=Agent&vertical=beauty&limit=1&cursor=${encodeURIComponent(first.payload.data.next_cursor)}`);
      assert.equal(mismatch.response.status, 400);
      assert.equal(mismatch.payload.error, 'cursor_mismatch');
      assert.equal(filterMismatch.response.status, 400);
    });
  } finally { fixture.close(); }
});

test('hot, topic search and detail preserve evidence URLs but redact stored payload internals', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const hotPosts = await json(origin, '/hot?vertical=ai-tech&window=24h&type=post');
      const hotTopics = await json(origin, '/hot?vertical=ai-tech&window=24h&type=cross_platform');
      const topics = await json(origin, '/topics?q=Agent&window=24h&limit=10');
      const detail = await json(origin, '/topics/topic-agent');
      assert.equal(hotPosts.payload.data.items[0].hotness.score, 88);
      assert.deepEqual(hotTopics.payload.data.items.map((item) => item.id), ['topic-agent']);
      assert.deepEqual(topics.payload.data.items.map((item) => item.id), ['topic-agent']);
      assert.equal(detail.payload.data.evidence[0].url, 'https://www.youtube.com/watch?v=video-3');
      assert.equal(JSON.stringify(detail.payload).includes('must-not-leak'), false);
    });
  } finally { fixture.close(); }
});

test('hot post ranking orders the full filtered window by score before applying the limit', async () => {
  const fixture = makeFixture();
  try {
    fixture.store.recordHotnessScore('post-ai-2', {
      formulaVersion: 'creator-hotness-v1', score: 99, unroundedScore: 98.8,
      confidence: 'high', inputs: {}, components: {}, penalties: {}
    }, '2026-08-29T12:01:00.000Z');
    await withServer(fixture, async (origin) => {
      const result = await json(origin, '/hot?vertical=ai-tech&window=24h&type=post&limit=1');
      assert.deepEqual(result.payload.data.items.map((item) => item.id), ['post-ai-2']);
      assert.equal(result.payload.data.items[0].hotness.score, 99);
    });
  } finally { fixture.close(); }
});

test('cross-platform topic filtering and hotness ranking happen before applying the limit', async () => {
  const fixture = makeFixture();
  try {
    const insertTopic = fixture.store.db.prepare(`
      INSERT INTO creator_topics (
        id, vertical_id, title, summary, first_seen_at, latest_seen_at, hotness,
        formula_version, creator_count, platform_count, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTopic.run(
      'topic-new-single-platform', 'ai-tech', '更新但未扩散', '只有单平台的更新主题',
      '2026-08-29T11:30:00.000Z', '2026-08-29T11:59:00.000Z', 99,
      'creator-topic-v1', 5, 1, '{}', NOW, NOW
    );
    insertTopic.run(
      'topic-hot-cross-platform', 'ai-tech', '真正跨平台热点', '高热度跨平台主题',
      '2026-08-29T08:00:00.000Z', '2026-08-29T10:30:00.000Z', 96,
      'creator-topic-v1', 4, 3, '{}', NOW, NOW
    );
    await withServer(fixture, async (origin) => {
      const result = await json(origin, '/hot?vertical=ai-tech&window=24h&type=cross_platform&limit=1');
      assert.deepEqual(result.payload.data.items.map((item) => item.id), ['topic-hot-cross-platform']);
      assert.equal(result.payload.data.items[0].hotness, 96);
    });
  } finally { fixture.close(); }
});

test('source coverage redacts credentials and reports configured accounts and latest post', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const result = await json(origin, '/sources');
      assert.equal(result.payload.data.items[0].accountCount, 1);
      assert.equal(result.payload.data.items[0].latestPostAt, '2026-08-29T11:00:00.000Z');
      assert.equal(JSON.stringify(result.payload).includes('YOUTUBE_SECRET'), false);
      assert.equal(JSON.stringify(result.payload).includes('must-not-leak'), false);
      assertMetadata(result.payload);
    });
  } finally { fixture.close(); }
});

test('changes use ascending AUTOINCREMENT seq and return 410 with a filtered resync after retention gaps', async () => {
  const fixture = makeFixture();
  try {
    const startingSeq = fixture.store.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM creator_events').get().seq;
    fixture.store.appendCreatorEvent({
      id: 'event-1', eventType: 'post_created', entityType: 'post', entityId: 'post-ai-2',
      verticalId: 'ai-tech', platform: 'youtube', occurredAt: '2026-08-29T10:00:00.000Z',
      payload: { title: '公开标题', secret: 'must-not-leak', evidenceUrls: ['https://example.com/evidence', 'http://127.0.0.1/private'] }
    });
    fixture.store.appendCreatorEvent({ id: 'event-2', eventType: 'post_hot', entityType: 'post', entityId: 'post-ai-3', verticalId: 'ai-tech', platform: 'youtube', score: 88, formulaVersion: 'creator-hotness-v1', occurredAt: '2026-08-29T11:00:00.000Z' });
    await withServer(fixture, async (origin) => {
      const changes = await json(origin, '/changes?since=0&limit=10');
      const sequences = changes.payload.data.items.map((item) => item.seq);
      assert.deepEqual(sequences, [...sequences].sort((left, right) => left - right));
      assert.deepEqual(changes.payload.data.items.filter((item) => item.id.startsWith('event-')).map((item) => item.seq), [startingSeq + 1, startingSeq + 2]);
      assert.equal(changes.payload.meta.next_cursor, startingSeq + 2);
      assert.deepEqual(changes.payload.data.items.find((item) => item.id === 'event-1').payload, {
        title: '公开标题', evidenceUrls: ['https://example.com/evidence']
      });
      assert.equal(JSON.stringify(changes.payload).includes('must-not-leak'), false);
      fixture.store.db.prepare('DELETE FROM creator_events WHERE seq = 1').run();
      const expired = await json(origin, '/changes?since=0&limit=10&vertical=ai-tech&platform=youtube');
      assert.equal(expired.response.status, 410);
      assert.equal(expired.payload.error, 'cursor_expired');
      assert.match(expired.payload.resync, /vertical=ai-tech/);
      assert.match(expired.payload.resync, /platform=youtube/);
    });
  } finally { fixture.close(); }
});

test('unknown resources, invalid windows and limits above the maximum return precise 4xx errors', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      assert.equal((await json(origin, '/creators/missing')).response.status, 404);
      assert.equal((await json(origin, '/topics/missing')).response.status, 404);
      assert.equal((await json(origin, '/posts?limit=101')).response.status, 400);
      assert.equal((await json(origin, '/hot?window=7d&type=post')).response.status, 400);
      assert.equal((await json(origin, '/hot?window=24h&type=unknown')).response.status, 400);
    });
  } finally { fixture.close(); }
});

test('admin endpoints fail closed and valid requests import, refresh, backfill and list status', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const missing = await json(origin, '/admin/refresh', { method: 'POST' });
      const wrong = await json(origin, '/admin/refresh', { method: 'POST', headers: { 'x-admin-api-key': 'wrong' } });
      assert.equal(missing.response.status, 401);
      assert.equal(wrong.response.status, 403);

      const headers = { 'content-type': 'application/json', 'x-admin-api-key': 'correct-key' };
      const refreshed = await json(origin, '/admin/refresh', { method: 'POST', headers, body: '{}' });
      const backfill = await json(origin, '/admin/backfill', { method: 'POST', headers, body: JSON.stringify({ accountId: 'account-a', force: true }) });
      const statuses = await json(origin, '/admin/backfills?state=running&limit=10', { headers });
      const imported = await json(origin, '/admin/creators/import', {
        method: 'POST', headers, body: JSON.stringify({
          version: 'creator-seeds-v1', generatedAt: NOW, creators: [{
            id: 'creator-c', displayName: 'New Creator', kind: 'person', reviewStatus: 'verified', reviewedAt: NOW,
            verticalIds: ['ai-tech'], accounts: [{
              id: 'account-c', platform: 'github', externalAccountId: 'github-user-100', handle: 'new-creator',
              profileUrl: 'https://github.com/new-creator', region: 'global', sourceTier: 'L1', visibility: 'public',
              enabled: true, lastVerifiedAt: NOW, authState: 'not_required'
            }]
          }]
        })
      });
      assert.equal(refreshed.response.status, 200);
      assert.equal(backfill.payload.data.accountId, 'account-a');
      assert.equal(statuses.payload.data.items[0].accountId, 'account-a');
      assert.equal(imported.payload.data.creatorCount, 1);
      assert.equal(fixture.calls.refresh, 1);
      assert.equal(fixture.calls.backfill, 1);
    });
  } finally { fixture.close(); }
});

test('admin routes return 503 when no management key is configured', async () => {
  const fixture = makeFixture();
  try {
    await withServer(fixture, async (origin) => {
      const result = await json(origin, '/admin/refresh', { method: 'POST' });
      assert.equal(result.response.status, 503);
      assert.equal(result.payload.error, 'admin_not_configured');
    }, { adminKey: '' });
  } finally { fixture.close(); }
});

test('authenticated users manage only their own subscriptions and delivery endpoints', async () => {
  const fixture = makeFixture();
  try {
    const requireUser = (req, res, next) => {
      const userId = req.get('x-test-user');
      if (!userId) return res.status(401).json({ success: false, error: '未登录' });
      req.authUser = { id: userId };
      return next();
    };
    await withServer(fixture, async (origin) => {
      const unauthorized = await json(origin, '/subscriptions');
      assert.equal(unauthorized.response.status, 401);
      const headers = { 'content-type': 'application/json', 'x-test-user': 'user-a' };
      const endpoint = await json(origin, '/delivery-endpoints', {
        method: 'POST', headers,
        body: JSON.stringify({ id: 'endpoint-a', type: 'in_app', destination: 'user-a', secretRef: 'env:PRIVATE' })
      });
      assert.equal(endpoint.response.status, 200);
      assert.equal(JSON.stringify(endpoint.payload).includes('PRIVATE'), false);
      const subscription = await json(origin, '/subscriptions', {
        method: 'POST', headers,
        body: JSON.stringify({
          id: 'subscription-a', name: 'AI 热点', deliveryMode: 'immediate', endpointIds: ['endpoint-a'],
          filters: { verticals: ['ai-tech'], minimumScore: 75 }
        })
      });
      assert.equal(subscription.payload.data.id, 'subscription-a');
      const ownerList = await json(origin, '/subscriptions', { headers });
      const otherList = await json(origin, '/subscriptions', { headers: { 'x-test-user': 'user-b' } });
      assert.deepEqual(ownerList.payload.data.items.map((item) => item.id), ['subscription-a']);
      assert.deepEqual(otherList.payload.data.items, []);
      const disabled = await json(origin, '/subscriptions/subscription-a', {
        method: 'PATCH', headers, body: JSON.stringify({ enabled: false })
      });
      assert.equal(disabled.payload.data.enabled, false);
      const removed = await json(origin, '/subscriptions/subscription-a', { method: 'DELETE', headers });
      assert.equal(removed.payload.data.removed, true);
    }, { requireUser });
  } finally { fixture.close(); }
});

test('server mounts the Creator API with the shared store, service and source registry before the 404 handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  assert.match(source, /createCreatorsRouter/);
  const mount = source.indexOf("app.use('/api/creators/v1'");
  const notFound = source.indexOf("app.use('*'");
  assert(mount > 0);
  assert(notFound > mount);
  assert.match(source.slice(mount, notFound), /creatorStore/);
  assert.match(source.slice(mount, notFound), /creatorService/);
  assert.match(source.slice(mount, notFound), /creatorSourceRegistry/);
});
