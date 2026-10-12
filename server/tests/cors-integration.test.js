const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-cors-'));
Object.assign(process.env, { AINEWS_DB_PATH: path.join(directory, 'test.db'), NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'https://news.example', ALLOWED_ORIGINS: 'https://reader.example', TRUST_PROXY: 'direct' });
const { app, server, io, creatorStore, youtubeWebSubService } = require('../index');
let origin;
test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => io.close(resolve));
  creatorStore.close();
  await require('../services/DatabaseService').close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('entrypoint sets explicit direct proxy trust', () => assert.equal(app.get('trust proxy'), false));

test('HTTP allows exact origins with credentials and preserves no-Origin requests', async () => {
  for (const browserOrigin of [undefined, 'https://news.example', 'https://reader.example']) {
    const response = await fetch(`${origin}/api/auth/session`, { headers: browserOrigin ? { origin: browserOrigin } : {} });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), browserOrigin || null);
    if (browserOrigin) assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  }
});

test('HTTP rejects disallowed origins before routing and handles preflight centrally', async () => {
  for (const browserOrigin of ['https://evil.example', 'null', 'https://reader.example.evil.test', 'http://reader.example']) {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await fetch(`${origin}/api/auth/session`, { method,
        headers: { origin: browserOrigin, 'access-control-request-method': 'GET' } });
      assert.equal(response.status, 403, `${method} ${browserOrigin}`);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
  }
  const allowed = await fetch(`${origin}/api/auth/session`, { method: 'OPTIONS',
    headers: { origin: 'https://reader.example', 'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://reader.example');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
});

test('Socket.IO polling uses the same exact allowlist and credential behavior', async () => {
  for (const browserOrigin of [undefined, 'https://news.example', 'https://reader.example', 'https://evil.example', 'null']) {
    const response = await fetch(`${origin}/socket.io/?EIO=4&transport=polling`, { headers: browserOrigin ? { origin: browserOrigin } : {} });
    const allowed = !browserOrigin || browserOrigin === 'https://news.example' || browserOrigin === 'https://reader.example';
    assert.equal(response.status, allowed ? 200 : 403);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? browserOrigin || null : null);
    if (allowed && browserOrigin) assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  }
});

function upgrade(browserOrigin) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${origin}/socket.io/?EIO=4&transport=websocket`, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(browserOrigin ? { Origin: browserOrigin } : {}) }
    });
    request.once('upgrade', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    request.once('response', response => { response.resume(); resolve(response.statusCode); });
    request.once('error', reject);
  });
}

test('real WebSocket upgrades enforce the same origin decisions, including no-Origin clients', async () => {
  for (const browserOrigin of [undefined, 'https://news.example', 'https://reader.example']) {
    assert.equal(await upgrade(browserOrigin), 101);
  }
  // Engine.IO rejects forbidden HTTP upgrades with 400; the security contract is that no 101 upgrade occurs.
  for (const browserOrigin of ['https://evil.example', 'null']) {
    const status = await upgrade(browserOrigin);
    assert.ok([400, 403].includes(status), `${browserOrigin} must not upgrade, received ${status}`);
  }
});

test('public discovery and WebSub use configured public origin regardless of forged host or protocol', async () => {
  const response = await fetch(`${origin}/openapi.json`, { headers: { Host: 'evil.example', 'x-forwarded-proto': 'http' } });
  assert.equal((await response.json()).servers[0].url, 'https://news.example');
  assert.equal(youtubeWebSubService.publicBaseUrl, 'https://news.example');
});

test('nginx delegates all CORS and preflight handling to the app while preserving WebSocket proxying', () => {
  const config = fs.readFileSync(path.join(__dirname, '../../nginx/nginx.conf'), 'utf8');
  assert.doesNotMatch(config, /add_header\s+['"]?Access-Control-/i);
  assert.doesNotMatch(config, /if\s*\(\$request_method\s*=\s*['"]?OPTIONS/i);
  assert.match(config, /proxy_set_header Upgrade \$http_upgrade/);
  assert.match(config, /proxy_set_header Connection "upgrade"/);
});
