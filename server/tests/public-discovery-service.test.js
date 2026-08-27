const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildJsonFeed,
  buildOpenApiDocument,
  buildPublicSkillMarkdown,
  buildRssFeed
  ,buildTopicJsonFeed,
  buildTopicRssFeed
} = require('../services/PublicDiscoveryService');

const NEWS = [{
  id: 'news-1',
  title: 'A & B 发布新模型',
  description: '只返回摘要，不返回第三方全文。',
  url: 'https://source.example/story',
  publishedAt: '2026-08-26T10:00:00.000Z',
  source: 'Source A',
  category: 'AI新闻'
}];

test('JSON Feed 1.1 keeps canonical source URLs and summary-only content', () => {
  const feed = buildJsonFeed(NEWS, { origin: 'https://ainews.example' });

  assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(feed.feed_url, 'https://ainews.example/feed.json');
  assert.equal(feed.items[0].url, NEWS[0].url);
  assert.equal(feed.items[0].content_text, NEWS[0].description);
  assert.equal(feed.items[0]._ayanews.source, 'Source A');
});

test('RSS output escapes XML and links back to the original publisher', () => {
  const rss = buildRssFeed(NEWS, { origin: 'https://ainews.example' });

  assert.match(rss, /<title>A &amp; B 发布新模型<\/title>/);
  assert.match(rss, /<link>https:\/\/source\.example\/story<\/link>/);
  assert.doesNotMatch(rss, /第三方文章全文/);
});

test('OpenAPI document matches live content and source health endpoints', () => {
  const document = buildOpenApiDocument({ origin: 'https://ainews.example' });

  assert.equal(document.openapi, '3.1.0');
  assert(document.paths['/api/content/v1/latest']);
  assert(document.paths['/api/content/v1/source-health']);
  assert(document.paths['/api/signals/v1/topics']);
  assert(document.paths['/api/signals/v1/topics/{id}']);
  assert(document.paths['/api/signals/v1/opportunities/random']);
  assert(document.paths['/api/signals/v1/changes']);
  assert(document.paths['/api/signals/v1/admin/refresh']);
  assert(document.paths['/topics/feed.json']);
  assert.deepEqual(document.components.schemas.SignalMetrics.properties.replies.type, ['number', 'null']);
  assert.equal(document.paths['/mcp'], undefined);
  assert.equal(document.paths['/api/v1/webhooks/subscriptions'], undefined);
});

test('Topic feeds use stable topic IDs and preserve original evidence links', () => {
  const topics = [{
    id: 'topic-stable', title: 'Acme AI Tool', summary: 'Cross-platform evidence',
    latestSeenAt: '2026-08-27T10:00:00.000Z', trendScore: 72, creatorScore: 68,
    trendDirection: 'rising', evidenceStrength: 'cross-platform',
    signals: [{ url: 'https://github.com/acme/tool', sourceName: 'GitHub', platform: 'github' }]
  }];
  const json = buildTopicJsonFeed(topics, { origin: 'https://ainews.example' });
  const rss = buildTopicRssFeed(topics, { origin: 'https://ainews.example' });

  assert.equal(json.feed_url, 'https://ainews.example/topics/feed.json');
  assert.equal(json.items[0].id, 'topic-stable');
  assert.equal(json.items[0].external_url, 'https://github.com/acme/tool');
  assert.deepEqual(json.items[0]._ayanews.evidence_urls, ['https://github.com/acme/tool']);
  assert.match(rss, /<guid isPermaLink="false">topic-stable<\/guid>/);
  assert.match(rss, /https:\/\/github\.com\/acme\/tool/);
});

test('public Skill documents source tiers, windows, changes, and unsupported protocol boundaries', () => {
  const markdown = buildPublicSkillMarkdown({ origin: 'https://ainews.example' });
  assert.match(markdown, /L1.*L2.*L3.*L4/s);
  assert.match(markdown, /24h.*48h.*72h/s);
  assert.match(markdown, /api\/signals\/v1\/changes/);
  assert.match(markdown, /single-source|单一来源/);
  assert.match(markdown, /MCP.*A2A.*Webhook/s);
});
