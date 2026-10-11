const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createWebhookTransport, validateWebhookDestination } = require('../services/creators/transports/webhook-transport');
const { createGenericMessageTransport } = require('../services/creators/transports/generic-message-transport');

const EVENT = { id: 'event-1', eventType: 'post.hot', entityId: 'post-1', occurredAt: '2026-08-29T12:00:00.000Z' };

test('webhook destination rejects non-HTTPS, userinfo, non-allowlisted ports, IP literals and private DNS', async () => {
  const lookup = async (host) => [{ address: host === 'public.example' ? '93.184.216.34' : '127.0.0.1', family: 4 }];
  for (const destination of [
    'http://public.example/hook', 'https://user:pass@public.example/hook',
    'https://public.example:8443/hook', 'https://127.0.0.1/hook', 'https://[::1]/hook',
    'https://private.example/hook'
  ]) {
    await assert.rejects(validateWebhookDestination(destination, { lookup }), /webhook_/);
  }
  const valid = await validateWebhookDestination('https://public.example/hook', { lookup });
  assert.equal(valid.address, '93.184.216.34');
});

test('webhook rejects every non-public DNS family including metadata and mixed rebinding answers', async () => {
  for (const [address, family] of [
    ['0.0.0.1', 4], ['10.1.2.3', 4], ['100.64.0.1', 4], ['127.0.0.1', 4],
    ['169.254.169.254', 4], ['172.16.0.1', 4], ['192.168.1.1', 4], ['198.18.0.1', 4],
    ['224.0.0.1', 4], ['240.0.0.1', 4], ['::', 6], ['::1', 6], ['fc00::1', 6],
    ['fe80::1', 6], ['ff00::1', 6], ['2001:db8::1', 6], ['::ffff:127.0.0.1', 6]
  ]) {
    await assert.rejects(validateWebhookDestination('https://dns.example/hook', {
      lookup: async () => [{ address, family }]
    }), /webhook_private_address/, address);
  }
  await assert.rejects(validateWebhookDestination('https://dns.example/hook', {
    lookup: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 }
    ]
  }), /webhook_private_address/);
});

test('webhook signs bounded JSON, pins freshly resolved DNS and never leaks its secret', async () => {
  let lookups = 0;
  const requests = [];
  const lookup = async () => [{ address: lookups++ === 0 ? '93.184.216.34' : '93.184.216.35', family: 4 }];
  const request = (options, callback) => {
    requests.push(options);
    const response = new EventEmitter();
    response.statusCode = 204;
    response.headers = {};
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.write = (body) => { req.body = body; };
    req.end = () => { callback(response); response.emit('end'); };
    req.destroy = () => {};
    return req;
  };
  const transport = createWebhookTransport({
    lookup, request, now: () => '2026-08-29T12:00:00.000Z',
    secretResolver: () => 'super-private-secret'
  });
  const endpoint = { id: 'endpoint-1', type: 'webhook', destination: 'https://public.example/hook', secretRef: 'env:HOOK_SECRET' };
  assert.equal((await transport({ outboxId: 'outbox-1', event: EVENT, endpoint })).status, 204);
  assert.equal((await transport({ outboxId: 'outbox-1', event: EVENT, endpoint })).status, 204);
  assert.equal(lookups, 2);
  assert.notEqual(requests[0].lookup, requests[1].lookup);
  assert.equal(requests[0].servername, 'public.example');
  assert.equal(requests[0].headers['x-aya-event-id'], 'event-1');
  assert.match(requests[0].headers['x-aya-signature'], /^sha256=[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(requests).includes('super-private-secret'), false);
  await new Promise((resolve, reject) => requests[0].lookup('public.example', {}, (error, address) => error ? reject(error) : (assert.equal(address, '93.184.216.34'), resolve())));
});

test('webhook refuses redirects and caps response size', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const makeRequest = (status, chunks) => (options, callback) => {
    const response = new EventEmitter(); response.statusCode = status; response.headers = { location: 'https://127.0.0.1/private' };
    const req = new EventEmitter(); req.setTimeout = () => {}; req.write = () => {};
    req.end = () => { callback(response); chunks.forEach((chunk) => response.emit('data', Buffer.alloc(chunk))); response.emit('end'); };
    req.destroy = () => {};
    return req;
  };
  const endpoint = { destination: 'https://public.example/hook', secretRef: 'env:HOOK' };
  const redirect = createWebhookTransport({ lookup, request: makeRequest(302, []), secretResolver: () => 'secret' });
  assert.equal((await redirect({ outboxId: 'o', event: EVENT, endpoint })).status, 302);
  const oversized = createWebhookTransport({ lookup, request: makeRequest(200, [70000]), secretResolver: () => 'secret', maxResponseBytes: 65536 });
  await assert.rejects(oversized({ outboxId: 'o', event: EVENT, endpoint }), /webhook_response_too_large/);
});

test('webhook aborts a timed-out request without exposing its secret', async () => {
  const request = () => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {};
    req.destroy = () => {};
    req.setTimeout = (milliseconds, callback) => {
      assert.equal(milliseconds, 100);
      queueMicrotask(callback);
    };
    return req;
  };
  const transport = createWebhookTransport({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request, timeoutMs: 100, secretResolver: () => 'timeout-secret'
  });
  await assert.rejects(transport({
    outboxId: 'timeout', event: EVENT,
    endpoint: { destination: 'https://public.example/hook', secretRef: 'env:TIMEOUT_SECRET' }
  }), (error) => error.message === 'webhook_timeout' && !error.message.includes('timeout-secret'));
});

test('optional message channels are explicitly unconfigured and make zero requests', async () => {
  let calls = 0;
  const transport = createGenericMessageTransport({ env: {}, fetch: async () => { calls += 1; } });
  const result = await transport({ endpoint: { type: 'feishu', destination: 'channel' }, event: EVENT });
  assert.deepEqual(result, { status: 503, error: 'transport_unconfigured:feishu' });
  assert.equal(calls, 0);
});

test('default webhook secret resolver accepts only the dedicated environment prefix', async () => {
  const previous = process.env.UNRELATED_SERVICE_SECRET;
  process.env.UNRELATED_SERVICE_SECRET = 'must-not-be-used';
  try {
    const transport = createWebhookTransport({
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
      request: () => { throw new Error('request_must_not_run'); }
    });
    const result = await transport({
      outboxId: 'o', event: EVENT,
      endpoint: { destination: 'https://public.example/hook', secretRef: 'env:UNRELATED_SERVICE_SECRET' }
    });
    assert.deepEqual(result, { status: 503, error: 'webhook_secret_unconfigured' });
  } finally {
    if (previous === undefined) delete process.env.UNRELATED_SERVICE_SECRET;
    else process.env.UNRELATED_SERVICE_SECRET = previous;
  }
});
