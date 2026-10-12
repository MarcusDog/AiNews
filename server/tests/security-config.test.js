const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadConfig(env) {
  assert.ok(fs.existsSync(path.join(__dirname, '../config/security.js')), 'shared security config must exist');
  return require('../config/security').loadSecurityConfig(env);
}

test('security defaults to direct access and a local public origin', () => {
  const config = loadConfig({});
  assert.equal(config.publicOrigin, 'http://localhost:3002');
  assert.equal(config.proxyMode, 'direct');
  assert.equal(config.trustProxy, false);
  assert.deepEqual(config.allowedOrigins, ['http://localhost:3002']);
});

test('canonical public origin and exact browser allowlist share one credential policy', async () => {
  const config = loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://NEWS.example:443/',
    ALLOWED_ORIGINS: 'https://reader.example, https://news.example,https://reader.example' });
  assert.equal(config.publicOrigin, 'https://news.example');
  assert.deepEqual(config.allowedOrigins, ['https://news.example', 'https://reader.example']);
  assert.equal(config.corsOptions.credentials, true);
  for (const origin of [undefined, 'https://news.example', 'https://reader.example']) {
    assert.equal(config.isOriginAllowed(origin), true);
    await new Promise((resolve, reject) => config.corsOptions.origin(origin, (error, allowed) => {
      if (error) return reject(error);
      assert.equal(allowed, true);
      resolve();
    }));
  }
  for (const origin of ['null', '', 'https://reader.example.evil.test', 'http://reader.example',
    'https://reader.example:444', 'https://reader.example/', 'https://reader.example,https://evil.test']) {
    assert.equal(config.isOriginAllowed(origin), false, origin);
    config.corsOptions.origin(origin, (error, allowed) => {
      assert.equal(error, null);
      assert.equal(allowed, false);
    });
  }
});

test('missing or malformed production origins fail closed', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /PUBLIC_ORIGIN/);
  for (const value of ['*', 'null', 'ftp://example.com', 'https://user:pass@example.com',
    'https://example.com/path', 'https://example.com?x=1', 'https://example.com#x',
    'https://*.example.com', 'https://example.com\\evil', 'https://example.com\n']) {
    assert.throws(() => loadConfig({ PUBLIC_ORIGIN: value }), /PUBLIC_ORIGIN/, value);
    assert.throws(() => loadConfig({ ALLOWED_ORIGINS: value }), /ALLOWED_ORIGINS/, value);
  }
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://news.example',
    ALLOWED_ORIGINS: 'http://reader.example' }), /HTTPS/);
  assert.throws(() => loadConfig({ ALLOWED_ORIGINS: 'https://a.example,,https://b.example' }), /ALLOWED_ORIGINS/);
});

test('legacy public base URL is a validated migration fallback, explicit PUBLIC_ORIGIN wins', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production', AYA_PUBLIC_BASE_URL: 'https://legacy.example/' }).publicOrigin,
    'https://legacy.example');
  assert.equal(loadConfig({ PUBLIC_ORIGIN: 'https://new.example', AYA_PUBLIC_BASE_URL: 'https://legacy.example' }).publicOrigin,
    'https://new.example');
});

test('proxy trust accepts only direct, loopback, or explicit IP/CIDR allowlists', () => {
  for (const value of ['direct', 'false']) assert.equal(loadConfig({ TRUST_PROXY: value }).trustProxy, false);
  assert.deepEqual(loadConfig({ TRUST_PROXY: 'loopback' }).trustProxy, ['loopback']);
  const config = loadConfig({ TRUST_PROXY: '127.0.0.1,10.12.0.0/16,::1' });
  assert.equal(config.proxyMode, 'allowlist');
  assert.deepEqual(config.trustProxy, ['127.0.0.1', '10.12.0.0/16', '::1']);
  for (const value of ['true', '1', '2', '*', '0.0.0.0/0', '::/0', '10.0.0.0/1',
    'localhost', 'uniquelocal', '127.0.0.1,', '127.0.0.1/33', '::1/129', '::ffff:0:0/96']) {
    assert.throws(() => loadConfig({ TRUST_PROXY: value }), /TRUST_PROXY/, value);
  }
});
