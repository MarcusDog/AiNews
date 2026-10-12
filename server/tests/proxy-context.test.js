const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-proxy-context-'));
process.env.AINEWS_DB_PATH = path.join(directory, 'test.db');
process.env.NODE_ENV = 'test';
const database = require('../services/DatabaseService');
const auth = require('../routes/auth');
const contact = require('../routes/contact');
test.after(async () => {
  await database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function contextModule() {
  assert.ok(fs.existsSync(path.join(__dirname, '../middleware/requestContext.js')), 'request context middleware must exist');
  return require('../middleware/requestContext');
}

async function withServer(trustProxy, useContext, run) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(express.json());
  if (useContext) app.use(contextModule().requestContext);
  app.get('/identity', (req, res) => res.json(req.requestContext));
  app.use('/auth', auth);
  app.use('/contact', contact);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('direct auth and contact routes store the peer IP even with spoofed forwarding headers', async () => {
  await withServer(false, false, async origin => {
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.66, 198.51.100.1',
      'x-real-ip': '203.0.113.77' };
    const register = await fetch(`${origin}/auth/register`, { method: 'POST', headers,
      body: JSON.stringify({ email: 'proxy@example.com', password: 'StrongPass123' }) });
    assert.equal(register.status, 201);
    const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers,
      body: JSON.stringify({ email: 'proxy@example.com', password: 'StrongPass123' }) });
    assert.equal(login.status, 200);
    const submitted = await fetch(`${origin}/contact/submit`, { method: 'POST', headers,
      body: JSON.stringify({ role: 'reader', delivery: 'web', problem: 'test', timeline: 'soon', contact: 'a@example.com' }) });
    assert.equal(submitted.status, 200);
    const sessions = await database.all('SELECT ip_address FROM auth_sessions');
    assert.equal(sessions.length, 2);
    for (const row of sessions) assert.equal(row.ip_address, '127.0.0.1');
    assert.equal((await database.get('SELECT ip_address FROM contacts')).ip_address, '127.0.0.1');
  });
});

test('Express trust processing ignores untrusted peers and stops at the nearest untrusted hop', async () => {
  for (const [trust, expected, ips] of [[false, '127.0.0.1', []], ['10.12.0.0/16', '127.0.0.1', []],
    ['loopback', '198.51.100.4', ['198.51.100.4']]]) {
    await withServer(trust, true, async origin => {
      const response = await fetch(`${origin}/identity`, { headers: { 'x-forwarded-for': '203.0.113.66, 198.51.100.4' } });
      const context = await response.json();
      assert.equal(context.ipAddress, expected);
      assert.deepEqual(context.ips, ips);
    });
  }
});

test('trusted proxy auth and contact routes persist the same normalized client address', async () => {
  await withServer('loopback', true, async origin => {
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': '::ffff:198.51.100.42' };
    const response = await fetch(`${origin}/auth/register`, { method: 'POST', headers,
      body: JSON.stringify({ email: 'trusted@example.com', password: 'StrongPass123' }) });
    assert.equal(response.status, 201);
    const submitted = await fetch(`${origin}/contact/submit`, { method: 'POST', headers,
      body: JSON.stringify({ role: 'trusted', delivery: 'web', problem: 'test', timeline: 'soon', contact: 'b@example.com' }) });
    assert.equal(submitted.status, 200);
    assert.equal((await database.get("SELECT s.ip_address FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'trusted@example.com'")).ip_address, '198.51.100.42');
    assert.equal((await database.get("SELECT ip_address FROM contacts WHERE role = 'trusted'")).ip_address, '198.51.100.42');
  });
});

test('request identity validates and bounds IP and user agent fields without reading raw forwarding headers', () => {
  const { getRequestContext } = contextModule();
  const context = getRequestContext({ ip: '2001:0DB8:0000::1', ips: ['::ffff:192.0.2.1', 'garbage'],
    headers: { 'user-agent': `agent\u0000${'x'.repeat(1000)}`, 'x-forwarded-for': '203.0.113.66' } });
  assert.equal(context.ipAddress, '2001:db8::1');
  assert.deepEqual(context.ips, ['192.0.2.1']);
  assert.equal(context.userAgent.length, 512);
  assert.equal(context.userAgent.includes('\u0000'), false);
  for (const ip of ['junk', '1.2.3.4,5.6.7.8', '1.2.3.4:80', 'x'.repeat(10000), 'fe80::1%eth0', undefined]) {
    assert.equal(getRequestContext({ ip, headers: {} }).ipAddress, null);
  }
});
