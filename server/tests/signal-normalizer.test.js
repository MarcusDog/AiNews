const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalizeUrl,
  normalizeSignal,
  signalFingerprint
} = require('../services/signals/signal-normalizer');

const SOURCE = {
  id: 'github-recent-ai',
  platform: 'github',
  region: 'global',
  trustClass: 'official'
};

test('canonical URLs remove tracking noise and reject unsafe schemes', () => {
  assert.equal(
    canonicalizeUrl('https://EXAMPLE.com/story/?utm_source=x&ref=home&b=2&a=1#section'),
    'https://example.com/story?a=1&b=2'
  );
  assert.equal(canonicalizeUrl('javascript:alert(1)'), null);
  assert.equal(canonicalizeUrl('file:///etc/passwd'), null);
  assert.equal(canonicalizeUrl('not a url'), null);
});

test('normalizer preserves absent metrics as null and normalizes real values', () => {
  const signal = normalizeSignal({
    externalId: 'repo-1',
    kind: 'repository',
    title: 'A useful AI repository',
    url: 'https://github.com/example/ai-tool?utm_campaign=launch',
    author: 'example',
    publishedAt: '2026-08-27T08:30:00+08:00',
    metrics: { stars: 120, forks: 9, comments: 0 },
    raw: { id: 1, secret: undefined }
  }, SOURCE, { now: new Date('2026-08-27T01:00:00.000Z') });

  assert.equal(signal.url, 'https://github.com/example/ai-tool');
  assert.equal(signal.publishedAt, '2026-08-27T00:30:00.000Z');
  assert.equal(signal.metrics.stars, 120);
  assert.equal(signal.metrics.comments, 0);
  assert.equal(signal.metrics.views, null);
  assert.equal(signal.metrics.replies, null);
  assert.equal(signal.sourceTrustClass, 'official');
  assert.equal(signal.rawJson, '{"id":1}');
  assert.match(signal.fingerprint, /^[a-f0-9]{64}$/);
});

test('fingerprints are deterministic across tracking URLs and object key order', () => {
  const first = signalFingerprint({
    sourceId: 'github-recent-ai',
    externalId: 'repo-1',
    url: 'https://example.com/repo?utm_source=one',
    publishedAt: '2026-08-27T00:00:00Z',
    title: '  Example Repo '
  });
  const second = signalFingerprint({
    title: 'Example Repo',
    publishedAt: '2026-08-27T00:00:00.000Z',
    url: 'https://example.com/repo',
    externalId: 'repo-1',
    sourceId: 'github-recent-ai'
  });

  assert.equal(first, second);
});

test('normalizer rejects incomplete signals and negative metrics', () => {
  assert.throws(() => normalizeSignal({ title: '', url: 'https://example.com' }, SOURCE), /title/);
  assert.throws(() => normalizeSignal({ title: 'Unsafe', url: 'javascript:alert(1)' }, SOURCE), /URL/);
  assert.throws(() => normalizeSignal({
    title: 'Bad metric',
    url: 'https://example.com/story',
    publishedAt: '2026-08-27T00:00:00Z',
    metrics: { likes: -1 }
  }, SOURCE), /likes/);
});
