const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyCanarySource,
  parseArgs,
  summarizeStoredAccount,
  validateStoredUrls
} = require('../scripts/canary-creator-sources');

test('canary CLI accepts the standalone help flag without requiring a value', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true });
});
const { responseError } = require('../services/creators/connectors/connector-utils');

test('source canary distinguishes online, unconfigured, and missing verified seeds', () => {
  assert.equal(classifyCanarySource({ configured: false }, []), 'unconfigured');
  assert.equal(classifyCanarySource({ configured: true }, []), 'not_attempted_no_verified_seed');
  assert.equal(classifyCanarySource({ configured: true }, [{ status: 'success', posts: [] }]), 'online_zero_result');
  assert.equal(classifyCanarySource({ configured: true }, [{ status: 'success', posts: [{}] }]), 'online');
  assert.equal(classifyCanarySource({ configured: true }, [{ status: 'blocked' }]), 'blocked');
  assert.equal(classifyCanarySource({ configured: true }, [{ status: 'failed' }]), 'degraded');
});

test('stored account summary exposes real boundaries and duplicate-safe counts', () => {
  const rows = [
    { url: 'https://example.com/a', published_at: '2026-08-27T00:00:00.000Z' },
    { url: 'https://example.com/b', published_at: '2026-08-29T00:00:00.000Z' }
  ];
  assert.deepEqual(summarizeStoredAccount(rows, { inserted: 2, updated: 0 }, { inserted: 0, updated: 2 }), {
    stored: 2,
    firstPassInserted: 2,
    firstPassUpdated: 0,
    replayInserted: 0,
    replayUpdated: 2,
    duplicateSafe: true,
    oldestPublishedAt: '2026-08-27T00:00:00.000Z',
    latestPublishedAt: '2026-08-29T00:00:00.000Z',
    originalUrlSample: 'https://example.com/a'
  });
});

test('stored URL validation rejects unsafe or non-original links without making network calls', () => {
  const result = validateStoredUrls([
    { url: 'https://github.com/openai/openai-node', provenance_url: 'https://github.com/openai' },
    { url: 'javascript:alert(1)', provenance_url: 'https://example.com' },
    { url: 'https://user:secret@example.com/private', provenance_url: 'https://example.com' }
  ]);
  assert.equal(result.checked, 3);
  assert.equal(result.validHttps, 1);
  assert.equal(result.invalid, 2);
});

test('GitHub anonymous quota exhaustion is classified as rate limited instead of permission missing', () => {
  const error = responseError({
    status: 403,
    headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1787999999' })
  }, new Date('2026-08-29T12:00:00.000Z'));
  assert.equal(error.status, 429);
  assert.equal(error.code, 'rate_limited');
  assert(Number.isFinite(error.retryAfterMs));
});
