const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createNewsRouter } = require('../routes/news');

function signal(id, region = 'global') {
  return {
    id: `signal-${id}`, sourceId: region === 'cn' ? 'bilibili-ai-popular' : 'reddit-localllama',
    sourceName: region === 'cn' ? 'Bilibili AI 热门' : 'Reddit r/LocalLLaMA',
    platform: region === 'cn' ? 'bilibili' : 'reddit', region,
    kind: region === 'cn' ? 'video' : 'discussion', title: `Signal ${id}`,
    url: `https://source.example/${id}`, publishedAt: '2026-08-27T10:00:00.000Z', metrics: {}
  };
}

function topic(id, region = 'global', creatorScore = 70) {
  return {
    id, title: `Topic ${id}`, summary: '真实热点', firstSeenAt: '2026-08-27T08:00:00.000Z',
    latestSeenAt: '2026-08-27T10:00:00.000Z', trendScore: 80, creatorScore,
    trendDirection: 'rising', evidenceStrength: 'cross-platform', formulaVersion: 'trend-v1',
    scoreBreakdown: {}, opportunity: {
      formulaVersion: 'opportunity-v2', profile: 'general', creatorScore,
      angles: [{ audience: 'creator', title: `今天做 ${id}`, angle: '从社交反馈切入' }], riskNotes: []
    }, evidenceCount: 2, signals: [signal(id, region)]
  };
}

function services() {
  const topics = [topic('global'), topic('cn', 'cn', 76)];
  const detailRequests = [];
  const listRequests = [];
  return {
    detailRequests,
    listRequests,
    newsService: {
      getLatestNews: async () => ({
        data: [{ id: 'news-1', title: '真实新闻', url: 'https://news.example/1', source: '官方来源', region: 'cn' }],
        total: 12474, page: 1, limit: 20
      }),
      getSources: async () => [{ name: '官方来源', count: 12474, sourceGroup: 'official' }],
      getStatistics: async () => ({ total: 12474, today: 18, categories: { AI新闻: 100 }, sources: { 官方来源: 12474 } }),
      getCategories: async () => [], getNewsCount: async () => 12474,
      getLastUpdateTime: () => '2026-08-27T10:00:00.000Z',
      getRecommendations: async () => [], getNewsById: async () => null,
      advancedSearch: async () => ({ data: [], total: 0 })
    },
    signalService: {
      listTopics: (options) => {
        listRequests.push(options);
        return topics.map(({ signals, ...item }) => item);
      },
      listCreatorOpportunities: ({ profile }) => profile === 'general' ? [topics[1]] : [],
      getTopic: (id, options) => {
        detailRequests.push({ id, options });
        return topics.find((item) => item.id === id) || null;
      },
      listSources: () => [{ id: 'reddit-localllama', name: 'Reddit r/LocalLLaMA', platform: 'reddit', region: 'global', status: 'online', lastSaved: 40 }]
    }
  };
}

async function withServer(run) {
  const app = express();
  const deps = services();
  app.use('/api/news', createNewsRouter(deps));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`, deps);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('feed and domestic routes expose real persisted news and domestic signal evidence', async () => {
  await withServer(async (origin, deps) => {
    const feedResponse = await fetch(`${origin}/api/news/feed?page=1&limit=20`);
    const feed = await feedResponse.json();
    const domesticResponse = await fetch(`${origin}/api/news/domestic?window=48h`);
    const domestic = await domesticResponse.json();

    assert.equal(feedResponse.status, 200);
    assert.equal(feed.data.items[0].id, 'news-1');
    assert.equal(feed.meta.total, 12474);
    assert.equal(domesticResponse.status, 200);
    assert.deepEqual(domestic.data.items.map((item) => item.id), ['cn']);
    assert.equal(domestic.data.items[0].signals[0].region, 'cn');
    assert.equal(deps.listRequests.at(-1).limit, 500);
  });
});

test('domestic route resolves evidence inside the requested time window', async () => {
  const app = express();
  const deps = services();
  app.use('/api/news', createNewsRouter(deps));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/news/domestic?window=24h`);
    assert.equal(response.status, 200);
    assert(deps.detailRequests.length > 0);
    assert(deps.detailRequests.every((request) => request.options?.windowHours === 24));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('hot-rank and discover return ranked real topics and creator opportunities', async () => {
  await withServer(async (origin) => {
    const hotRank = await fetch(`${origin}/api/news/hot-rank?window=24h`).then((response) => response.json());
    const discover = await fetch(`${origin}/api/news/discover?window=72h&profile=general`).then((response) => response.json());

    assert.deepEqual(hotRank.data.items.map((item) => item.id), ['global', 'cn']);
    assert.deepEqual(discover.data.items.map((item) => item.id), ['cn']);
    assert.equal(discover.meta.profile, 'general');
  });
});

test('dashboard and by-source aggregate News and Signal health without demo rows', async () => {
  await withServer(async (origin) => {
    const dashboardResponse = await fetch(`${origin}/api/news/dashboard?window=72h`);
    const dashboard = await dashboardResponse.json();
    const bySourceResponse = await fetch(`${origin}/api/news/by-source`);
    const bySource = await bySourceResponse.json();

    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboard.data.news.total, 12474);
    assert.equal(dashboard.data.topics.items.length, 2);
    assert.equal(dashboard.data.sources.items[0].status, 'online');
    assert.equal(bySourceResponse.status, 200);
    assert.equal(bySource.data.news[0].count, 12474);
    assert.equal(bySource.data.signals[0].lastSaved, 40);
  });
});
