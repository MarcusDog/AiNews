const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSignalSourceCatalog,
  validateSignalSourceCatalog,
  TRUST_CLASSES
} = require('../config/signalSources');

test('signal catalog contains the complete source-tier inventory with unique executable contracts', () => {
  const catalog = buildSignalSourceCatalog({});
  const ids = catalog.map((source) => source.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(validateSignalSourceCatalog(catalog), []);
  assert(catalog.every((source) => ['L1', 'L2', 'L3', 'L4'].includes(source.tier)));
  assert(catalog.every((source) => ['cn', 'global'].includes(source.region)));
  assert(catalog.every((source) => TRUST_CLASSES.includes(source.trustClass)));
  assert(catalog.every((source) => Number.isInteger(source.timeoutMs) && source.timeoutMs > 0));

  const requiredPlatforms = [
    'news', 'hackernews', 'github', 'mastodon', 'reddit', 'huggingface', 'bilibili'
  ];
  requiredPlatforms.forEach((platform) => {
    assert(catalog.some((source) => source.tier === 'L1' && source.platform === platform));
  });
});

test('optional APIs and bridges are honest about configuration without leaking credentials', () => {
  const empty = buildSignalSourceCatalog({});
  const byId = new Map(empty.map((source) => [source.id, source]));

  for (const id of ['youtube-search', 'x-recent-search', 'rsshub-weibo-hot', 'newsnow-weibo', 'custom-json-bridges']) {
    assert.equal(byId.get(id).configured, false, id);
  }

  const configured = buildSignalSourceCatalog({
    YOUTUBE_API_KEY: 'secret-youtube',
    X_BEARER_TOKEN: 'secret-x',
    RSSHUB_BASE_URL: 'https://rss.internal.example',
    NEWSNOW_BASE_URL: 'https://news.internal.example',
    SIGNAL_BRIDGES_JSON: '[{"id":"creator-lab","url":"https://bridge.example/signals"}]'
  });
  const serialized = JSON.stringify(configured);

  assert.equal(serialized.includes('secret-youtube'), false);
  assert.equal(serialized.includes('secret-x'), false);
  assert.equal(configured.find((source) => source.id === 'youtube-search').configured, true);
  assert.equal(configured.find((source) => source.id === 'x-recent-search').configured, true);
  assert.equal(configured.find((source) => source.id === 'rsshub-weibo-hot').configured, true);
  assert.equal(configured.find((source) => source.id === 'newsnow-weibo').configured, true);
  assert.equal(configured.find((source) => source.id === 'custom-json-bridges').configured, true);
});

test('login-state enrichment tools remain visible but disabled sidecars', () => {
  const catalog = buildSignalSourceCatalog({});

  for (const id of ['mediacrawler-sidecar', 'agent-reach-sidecar']) {
    const source = catalog.find((item) => item.id === id);
    assert(source);
    assert.equal(source.tier, 'L4');
    assert.equal(source.mode, 'sidecar');
    assert.equal(source.enabled, false);
    assert.equal(source.configured, false);
    assert.equal(source.schedulable, false);
    assert.match(source.setupHint, /自托管|工作站/);
  }
});

test('catalog validation rejects unknown trust classes, duplicate ids, and invalid URLs', () => {
  const valid = buildSignalSourceCatalog({});
  const broken = [
    ...valid,
    { ...valid[0], trustClass: 'guesswork' },
    {
      ...valid[0],
      id: 'unsafe-source',
      endpoint: 'http://not-secure.example/feed'
    }
  ];
  const errors = validateSignalSourceCatalog(broken);

  assert(errors.some((error) => error.includes('id 重复')));
  assert(errors.some((error) => error.includes('trustClass')));
  assert(errors.some((error) => error.includes('HTTPS')));
});

test('Mastodon instances and Reddit communities can be configured without accepting unsafe endpoints', () => {
  const catalog = buildSignalSourceCatalog({
    MASTODON_INSTANCES: 'https://mastodon.social,https://fosstodon.org, http://unsafe.example',
    REDDIT_COMMUNITIES: 'LocalLLaMA,MachineLearning,LocalLLaMA,bad/name'
  });
  const mastodon = catalog.filter((item) => item.platform === 'mastodon');
  const reddit = catalog.filter((item) => item.platform === 'reddit');

  assert.deepEqual(mastodon.map((item) => item.endpoint), [
    'https://mastodon.social/api/v1/trends',
    'https://fosstodon.org/api/v1/trends'
  ]);
  assert.deepEqual(reddit.map((item) => item.community), ['LocalLLaMA', 'MachineLearning']);
  assert.equal(new Set(reddit.map((item) => item.endpoint)).size, 1);
  assert.match(reddit[0].endpoint, /LocalLLaMA\+MachineLearning\/\.rss\?limit=75$/);
  assert.deepEqual(validateSignalSourceCatalog(catalog), []);
});
