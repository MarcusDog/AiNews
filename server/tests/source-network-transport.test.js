const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifySourceError,
  createSourceTransport,
  redactNetworkText,
  resolveProxyUrl
} = require('../services/network/source-transport');
const { configuredTargets, isNonPublicAddress } = require('../scripts/diagnose-source-network');

test('dedicated source proxy wins and transport applies it without exposing credentials', async () => {
  const calls = [];
  const proxyUrl = 'http://collector-user:collector-pass@127.0.0.1:7897';
  const fakeAgent = { kind: 'proxy-agent' };
  const transport = createSourceTransport({
    env: { AYA_SOURCE_PROXY_URL: proxyUrl, HTTPS_PROXY: 'http://ignored:8080' },
    agentFactory: (value) => {
      assert.equal(value, proxyUrl);
      return fakeAgent;
    },
    axiosImpl: {
      get: async (url, options) => {
        calls.push({ url, options });
        return { status: 200, data: { ok: true } };
      }
    }
  });

  assert.equal(resolveProxyUrl({ AYA_SOURCE_PROXY_URL: proxyUrl, HTTPS_PROXY: 'http://ignored' }), proxyUrl);
  await transport.get('https://example.com/feed');
  assert.equal(calls[0].options.httpsAgent, fakeAgent);
  assert.equal(calls[0].options.proxy, false);
  assert.doesNotMatch(JSON.stringify(transport.describe()), /collector-(?:user|pass)/);
});

test('bounded retry retries transient upstream errors but not terminal client errors', async () => {
  let attempts = 0;
  const transport = createSourceTransport({
    env: { AYA_SOURCE_NETWORK_MODE: 'direct-only' },
    retries: 2,
    retryDelayMs: 0,
    axiosImpl: {
      get: async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error('upstream unavailable');
          error.response = { status: 503 };
          throw error;
        }
        return { status: 200, data: 'ok' };
      }
    }
  });
  assert.equal((await transport.get('https://example.com')).data, 'ok');
  assert.equal(attempts, 3);

  attempts = 0;
  const terminal = createSourceTransport({
    env: { AYA_SOURCE_NETWORK_MODE: 'direct-only' },
    retries: 3,
    retryDelayMs: 0,
    axiosImpl: {
      get: async () => {
        attempts += 1;
        const error = new Error('not found token=secret-value');
        error.response = { status: 404 };
        throw error;
      }
    }
  });
  await assert.rejects(() => terminal.get('https://example.com/missing'), (error) => {
    assert.equal(error.code, 'upstream_client_error');
    assert.doesNotMatch(error.message, /secret-value/);
    return true;
  });
  assert.equal(attempts, 1);
});

test('network failures are typed and diagnostic text is redacted', () => {
  assert.equal(classifySourceError({ code: 'ENOTFOUND' }).code, 'dns_failure');
  assert.equal(classifySourceError({ code: 'ECONNABORTED' }).code, 'timeout');
  assert.equal(classifySourceError({ response: { status: 429 } }).code, 'rate_limited');
  assert.equal(classifySourceError({ response: { status: 502 } }).code, 'upstream_server_error');
  assert.equal(
    redactNetworkText('https://user:pass@example.com/feed?token=abc&api_key=def Authorization: Bearer xyz'),
    'https://[redacted]@example.com/feed?token=[redacted]&api_key=[redacted] Authorization: [redacted]'
  );
});

test('production source diagnostics contain only configured HTTPS origins and flag private DNS', () => {
  const targets = configuredTargets({ NODE_ENV: 'production' });
  assert.ok(targets.length >= 8);
  assert.ok(targets.every((target) => /^https:\/\/[^/?#]+$/.test(target.origin)));
  assert.ok(targets.every((target) => !/mock/i.test(JSON.stringify(target))));
  assert.equal(isNonPublicAddress('127.0.0.1'), true);
  assert.equal(isNonPublicAddress('169.254.169.254'), true);
  assert.equal(isNonPublicAddress('8.8.8.8'), false);
});
