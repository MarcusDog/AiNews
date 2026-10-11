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
const { createContentRouter } = require('../routes/content');

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

test('brief accepts a Topic id and turns current Signal evidence into a cited research pack', async () => {
  const app = express();
  app.use('/api/content/v1', createContentRouter({
    newsService: { getAnalysisNews: async () => ({ data: [] }) },
    signalService: { getTopic: (id, options) => id === 'topic-qwen' ? ({
      id, title: 'Qwen3.8 Flash Next', signals: [{
        id: 'hf', title: 'Qwen/Qwen3.8-Flash-Next', summary: 'Official model card',
        url: 'https://huggingface.co/Qwen/Qwen3.8-Flash-Next', sourceName: 'Hugging Face Trending',
        sourceTrustClass: 'official', platform: 'huggingface', region: 'global', kind: 'model',
        publishedAt: '2026-08-27T10:00:00.000Z'
      }, {
        id: 'reddit', title: 'Qwen3.8 Flash Next community feedback', summary: 'Real user discussion',
        url: 'https://www.reddit.com/r/LocalLLaMA/comments/qwen', sourceName: 'Reddit r/LocalLLaMA',
        sourceTrustClass: 'public_feed', platform: 'reddit', region: 'global', kind: 'discussion',
        publishedAt: '2026-08-27T11:00:00.000Z'
      }]
    }) : null }
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/content/v1/brief?topic=Qwen3.8&topicId=topic-qwen&days=14&limit=6`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.status, 'ready');
    assert.deepEqual(payload.data.evidence.map((item) => item.url), [
      'https://huggingface.co/Qwen/Qwen3.8-Flash-Next',
      'https://www.reddit.com/r/LocalLLaMA/comments/qwen'
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
