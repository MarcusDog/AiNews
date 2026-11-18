const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithTimeout } = require('../services/creators/connectors/connector-utils');

test('already-aborted connector requests never start an upstream fetch', async () => {
  const controller = new AbortController();
  const reason = new Error('caller cancelled');
  controller.abort(reason);
  let calls = 0;
  await assert.rejects(
    fetchWithTimeout(async () => { calls++; return { ok: true }; }, 'https://example.com', { signal: controller.signal }),
    (error) => error === reason
  );
  assert.equal(calls, 0);
});

test('uncancelled connector requests still forward the caller options', async () => {
  const controller = new AbortController();
  const response = { ok: true };
  let received;
  const result = await fetchWithTimeout(async (_url, options) => {
    received = options;
    return response;
  }, 'https://example.com', { signal: controller.signal, headers: { Accept: 'application/json' } });
  assert.equal(result, response);
  assert.equal(received.headers.Accept, 'application/json');
  assert.equal(received.signal.aborted, false);
});
