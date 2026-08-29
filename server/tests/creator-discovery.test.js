const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpenApiDocument,
  buildPublicSkillMarkdown
} = require('../services/PublicDiscoveryService');

const PUBLIC_CREATOR_PATHS = [
  '/api/creators/v1/verticals',
  '/api/creators/v1/creators',
  '/api/creators/v1/creators/{id}',
  '/api/creators/v1/creators/{id}/posts',
  '/api/creators/v1/posts',
  '/api/creators/v1/hot',
  '/api/creators/v1/topics',
  '/api/creators/v1/topics/{id}',
  '/api/creators/v1/sources',
  '/api/creators/v1/changes',
  '/api/creators/v1/stream'
];

const ACCOUNT_PATHS = [
  '/api/auth/register', '/api/auth/login', '/api/auth/session', '/api/auth/me',
  '/api/creators/v1/subscriptions',
  '/api/creators/v1/subscriptions/{id}',
  '/api/creators/v1/delivery-endpoints',
  '/api/creators/v1/delivery-endpoints/{id}',
  '/api/creators/v1/delivery-endpoints/{id}/test',
  '/api/creators/v1/deliveries'
];

const ADMIN_PATHS = [
  '/api/creators/v1/admin/creators/import',
  '/api/creators/v1/admin/refresh',
  '/api/creators/v1/admin/backfill',
  '/api/creators/v1/admin/backfills',
  '/api/creators/v1/admin/maintenance/preview',
  '/api/creators/v1/admin/maintenance/execute',
  '/api/creators/v1/admin/backup',
  '/api/creators/v1/admin/export'
];

test('OpenAPI publishes every implemented Creator route with exact auth boundaries', () => {
  const document = buildOpenApiDocument({ origin: 'https://ainews.example' });
  for (const path of [...PUBLIC_CREATOR_PATHS, ...ACCOUNT_PATHS, ...ADMIN_PATHS]) {
    assert(document.paths[path], path);
  }
  assert(document.paths['/api/ingest/v1/youtube/websub'].get);
  assert(document.paths['/api/ingest/v1/youtube/websub'].post);
  assert(document.paths['/api/ingest/v1/creator-bridge'].post);
  assert.deepEqual(document.paths['/api/creators/v1/subscriptions'].get.security, [{ SessionCookie: [] }]);
  assert.deepEqual(document.paths['/api/creators/v1/admin/backup'].post.security, [{ AdminApiKey: [] }]);
  assert.equal(document.components.securitySchemes.SessionCookie.type, 'apiKey');
  assert.equal(document.components.securitySchemes.SessionCookie.in, 'cookie');
});

test('OpenAPI describes search, opaque cursors, event replay and truthful history coverage', () => {
  const document = buildOpenApiDocument({ origin: 'https://ainews.example' });
  const parameters = (path, method = 'get') => document.paths[path][method].parameters || [];
  const names = (path, method = 'get') => parameters(path, method).map((item) => item.name);
  assert(names('/api/creators/v1/posts').includes('q'));
  assert(names('/api/creators/v1/posts').includes('cursor'));
  assert.match(parameters('/api/creators/v1/posts').find((item) => item.name === 'cursor').description, /opaque|不透明/i);
  assert(names('/api/creators/v1/changes').includes('since'));
  assert.equal(document.paths['/api/creators/v1/changes'].get.responses[410].description, '游标已过期，需要重新同步');
  assert(parameters('/api/creators/v1/stream').some((item) => item.in === 'header' && item.name === 'Last-Event-ID'));
  assert(document.paths['/api/creators/v1/stream'].get.responses[410]);
  assert.deepEqual(document.components.schemas.CreatorBackfillState.enum, ['pending', 'running', 'complete', 'partial', 'blocked']);
  assert.deepEqual(document.components.schemas.CreatorEvent.properties.eventType.enum, ['post.published', 'post.hot', 'topic.multi_creator', 'topic.cross_platform']);
});

test('OpenAPI documents WebSub raw signatures, Bridge HMAC and preview-first maintenance', () => {
  const document = buildOpenApiDocument({ origin: 'https://ainews.example' });
  const bridgeHeaders = document.paths['/api/ingest/v1/creator-bridge'].post.parameters.map((item) => item.name);
  assert.deepEqual(bridgeHeaders, ['x-aya-source-id', 'x-aya-timestamp', 'x-aya-nonce', 'x-aya-signature']);
  assert.match(document.paths['/api/ingest/v1/creator-bridge'].post.description, /raw.*sha256|原始.*sha256/i);
  assert.match(document.paths['/api/ingest/v1/youtube/websub'].post.description, /X-Hub-Signature-256/);
  assert(document.paths['/api/creators/v1/admin/maintenance/execute'].post.requestBody);
  assert(document.paths['/api/creators/v1/admin/backup'].post.responses[200]);
  assert(document.paths['/api/creators/v1/admin/export'].post.responses[200]);
});

test('public Skill documents Creator workflows and never claims gated platforms are online', () => {
  const markdown = buildPublicSkillMarkdown({ origin: 'https://ainews.example' });
  for (const word of ['美妆', '穿搭', 'AI 科技', '娱乐', 'creator-hotness-v1', 'partial', 'blocked', 'unconfigured', 'Sidecar']) {
    assert.match(markdown, new RegExp(word), word);
  }
  assert.match(markdown, /api\/creators\/v1\/posts.*q=/s);
  assert.match(markdown, /Last-Event-ID.*410/s);
  assert.match(markdown, /Webhook.*签名.*重试.*死信/s);
  assert.match(markdown, /X.*Instagram.*抖音.*未配置|unconfigured/s);
});
