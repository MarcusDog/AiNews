const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveApiRateLimit } = require('../middleware/apiRateLimit');

test('dashboard read traffic has a practical default limit and supports bounded overrides', () => {
  assert.deepEqual(resolveApiRateLimit({}), { windowMs: 60_000, max: 300 });
  assert.deepEqual(resolveApiRateLimit({ AINEWS_API_RATE_LIMIT_PER_MINUTE: '500' }), {
    windowMs: 60_000,
    max: 500
  });
  assert.deepEqual(resolveApiRateLimit({ AINEWS_API_RATE_LIMIT_PER_MINUTE: '999999' }), {
    windowMs: 60_000,
    max: 2_000
  });
});
