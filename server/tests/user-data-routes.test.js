const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-user-data-'));
process.env.AINEWS_DB_PATH = path.join(tmpDir, 'user-data.db');
process.env.NODE_ENV = 'test';

process.on('exit', () => fs.rmSync(tmpDir, { recursive: true, force: true }));

const authRoutes = require('../routes/auth');
const userDataRoutes = require('../routes/userData');
const DatabaseService = require('../services/DatabaseService');

function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/user-data', userDataRoutes);
  return app.listen(0);
}

async function request(server, pathname, options = {}) {
  return fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options);
}

async function register(server, email) {
  const response = await request(server, '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'StrongPass123', displayName: email.split('@')[0] })
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
}

test('user-data routes require a session and never expose another account data', async () => {
  await DatabaseService.close();
  const server = createServer();

  try {
    assert.equal((await request(server, '/api/user-data')).status, 401);
    const cookieA = await register(server, 'reader-a@example.com');
    const cookieB = await register(server, 'reader-b@example.com');

    const addResponse = await request(server, '/api/user-data/favorites', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookieA },
      body: JSON.stringify({
        article: { id: 'story-1', title: 'A 的收藏', url: 'https://example.com/story-1', category: 'AI新闻' }
      })
    });
    assert.equal(addResponse.status, 200);

    await request(server, '/api/user-data/read-history/story-1', {
      method: 'POST',
      headers: { cookie: cookieA }
    });

    const dataA = await (await request(server, '/api/user-data', { headers: { cookie: cookieA } })).json();
    const dataB = await (await request(server, '/api/user-data', { headers: { cookie: cookieB } })).json();

    assert.equal(dataA.data.favorites[0].title, 'A 的收藏');
    assert.equal(dataA.data.readHistory[0].id, 'story-1');
    assert.deepEqual(dataB.data, { favorites: [], readHistory: [] });
  } finally {
    await DatabaseService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('user-data import is idempotent and clear operations are scoped to the session user', async () => {
  await DatabaseService.close();
  const server = createServer();

  try {
    const cookie = await register(server, 'import@example.com');
    const payload = {
      favorites: [{ id: 'legacy', title: '旧收藏', favoritedAt: 1234 }],
      readHistory: [{ id: 'legacy', readAt: 2345 }]
    };

    for (let index = 0; index < 2; index += 1) {
      const response = await request(server, '/api/user-data/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
    }

    let data = await (await request(server, '/api/user-data', { headers: { cookie } })).json();
    assert.equal(data.data.favorites.length, 1);
    assert.equal(data.data.readHistory.length, 1);

    assert.equal((await request(server, '/api/user-data/favorites', { method: 'DELETE', headers: { cookie } })).status, 200);
    assert.equal((await request(server, '/api/user-data/read-history', { method: 'DELETE', headers: { cookie } })).status, 200);

    data = await (await request(server, '/api/user-data', { headers: { cookie } })).json();
    assert.deepEqual(data.data, { favorites: [], readHistory: [] });
  } finally {
    await DatabaseService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
