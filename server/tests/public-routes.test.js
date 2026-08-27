const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-public-routes-'));
process.env.AINEWS_DB_PATH = path.join(tempDirectory, 'public-routes.db');

const NewsService = require('../services/NewsService');
const publicRoutes = require('../routes/public');

async function withServer(run) {
  const app = express();
  app.use(publicRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withRouter(router, run) {
  const app = express();
  app.use(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('machine-readable public routes return live formats without JavaScript', async () => {
  const original = NewsService.getLatestNews;
  NewsService.getLatestNews = async () => ({ data: [{
    id: 'news-1',
    title: 'Public news',
    description: 'Summary',
    url: 'https://source.example/story',
    publishedAt: '2026-08-26T10:00:00Z',
    source: 'Source'
  }], total: 1 });

  try {
    await withServer(async (origin) => {
      const skill = await fetch(`${origin}/skill.md`);
      const openapi = await fetch(`${origin}/openapi.json`);
      const feed = await fetch(`${origin}/feed.json`);
      const rss = await fetch(`${origin}/rss.xml`);

      assert.match(skill.headers.get('content-type'), /text\/markdown/);
      assert.match(await skill.text(), /No Evidence|先检索，后结论/);
      assert.equal((await openapi.json()).openapi, '3.1.0');
      assert.equal((await feed.json()).items[0].url, 'https://source.example/story');
      assert.match(rss.headers.get('content-type'), /application\/rss\+xml/);
      assert.match(await rss.text(), /Public news/);
    });
  } finally {
    NewsService.getLatestNews = original;
  }
});

test('Topic feeds are backed only by persisted topics and real evidence URLs', async () => {
  const signalService = {
    listTopics: () => [{ id: 'topic-1' }],
    getTopic: () => ({
      id: 'topic-1', title: 'Persisted topic', summary: 'Evidence backed',
      latestSeenAt: '2026-08-27T10:00:00.000Z', trendScore: 70, creatorScore: 60,
      trendDirection: 'rising', evidenceStrength: 'cross-platform',
      signals: [{ url: 'https://github.com/acme/tool', sourceName: 'GitHub', platform: 'github' }]
    })
  };
  await withRouter(publicRoutes.createPublicRouter({ newsService: NewsService, signalService }), async (origin) => {
    const feed = await fetch(`${origin}/topics/feed.json`).then((response) => response.json());
    const rss = await fetch(`${origin}/topics/rss.xml`).then((response) => response.text());
    assert.equal(feed.items[0].id, 'topic-1');
    assert.equal(feed.items[0].external_url, 'https://github.com/acme/tool');
    assert.match(rss, /Persisted topic/);
  });
});
