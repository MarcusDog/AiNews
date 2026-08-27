const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-content-routes-'));
process.env.AINEWS_DB_PATH = path.join(tempDirectory, 'content-routes.db');

const NewsService = require('../services/NewsService');
const contentRoutes = require('../routes/content');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/content/v1', contentRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('public content source endpoints expose sanitized source health data', async () => {
  const original = NewsService.getAdminSources;
  NewsService.getAdminSources = async () => [{
    name: 'Official Feed',
    url: 'https://example.com/feed.xml',
    category: 'AI新闻',
    language: 'en',
    source_group: 'product',
    source_group_label: '产品与官方',
    configured_enabled: true,
    is_active: 1,
    fail_count: 0,
    article_count: 12,
    last_success: new Date().toISOString(),
    error_message: 'must not be public'
  }];

  try {
    await withServer(async (origin) => {
      const sources = await fetch(`${origin}/api/content/v1/sources`).then((response) => response.json());
      const health = await fetch(`${origin}/api/content/v1/source-health`).then((response) => response.json());

      assert.equal(sources.success, true);
      assert.equal(sources.data[0].name, 'Official Feed');
      assert.equal('errorMessage' in sources.data[0], false);
      assert.equal(health.data.summary.total, 1);
      assert.equal(health.data.summary.healthy, 1);
    });
  } finally {
    NewsService.getAdminSources = original;
  }
});

test('capabilities advertise implemented Signal and Topic tools without claiming MCP or A2A', async () => {
  await withServer(async (origin) => {
    const payload = await fetch(`${origin}/api/content/v1/capabilities`).then((response) => response.json());
    const paths = payload.data.tools.map((tool) => tool.path);
    assert(paths.includes('/api/signals/v1/topics?window=72h'));
    assert(paths.includes('/api/signals/v1/opportunities/random?window=72h'));
    assert(paths.includes('/api/signals/v1/changes?since=0'));
    assert.equal(paths.some((path) => /mcp|a2a|webhook/i.test(path)), false);
  });
});
