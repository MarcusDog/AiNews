const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-auth-'));
process.env.AINEWS_DB_PATH = path.join(tmpDir, 'auth.db');
process.env.NODE_ENV = 'test';

process.on('exit', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const authRoutes = require('../routes/auth');
const DatabaseService = require('../services/DatabaseService');

function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app.listen(0);
}

function getCookieFromResponse(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'expected set-cookie header');
  return header.split(';')[0];
}

async function request(server, pathName, options = {}) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}${pathName}`, options);
}

test('auth routes support register, login, me and logout flow', async () => {
  await DatabaseService.close();
  const server = createServer();

  try {
    const registerResponse = await request(server, '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'StrongPass123',
        displayName: 'Alice'
      })
    });

    assert.equal(registerResponse.status, 201);
    const registerBody = await registerResponse.json();
    assert.equal(registerBody.success, true);
    assert.equal(registerBody.data.user.email, 'user@example.com');
    assert.equal(registerBody.data.user.displayName, 'Alice');
    const registerCookie = getCookieFromResponse(registerResponse);

    const meResponse = await request(server, '/api/auth/me', {
      headers: { cookie: registerCookie }
    });

    assert.equal(meResponse.status, 200);
    const meBody = await meResponse.json();
    assert.equal(meBody.data.user.email, 'user@example.com');

    const duplicateResponse = await request(server, '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'StrongPass123',
        displayName: 'Alice 2'
      })
    });

    assert.equal(duplicateResponse.status, 409);

    const loginResponse = await request(server, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'StrongPass123'
      })
    });

    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    assert.equal(loginBody.success, true);
    const loginCookie = getCookieFromResponse(loginResponse);

    const logoutResponse = await request(server, '/api/auth/logout', {
      method: 'POST',
      headers: { cookie: loginCookie }
    });

    assert.equal(logoutResponse.status, 200);

    const meAfterLogoutResponse = await request(server, '/api/auth/me', {
      headers: { cookie: loginCookie }
    });

    assert.equal(meAfterLogoutResponse.status, 401);
  } finally {
    await DatabaseService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('auth routes reject invalid credentials', async () => {
  await DatabaseService.close();
  const server = createServer();

  try {
    const response = await request(server, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'missing@example.com',
        password: 'WrongPass123'
      })
    });

    assert.equal(response.status, 401);
  } finally {
    await DatabaseService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('auth routes allow profile updates and password rotation for authenticated users', async () => {
  await DatabaseService.close();
  const server = createServer();

  try {
    const registerResponse = await request(server, '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'profile@example.com',
        password: 'StrongPass123',
        displayName: 'Initial User'
      })
    });

    const cookie = getCookieFromResponse(registerResponse);

    const profileResponse = await request(server, '/api/auth/profile', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        displayName: 'Updated User'
      })
    });

    assert.equal(profileResponse.status, 200);
    const profileBody = await profileResponse.json();
    assert.equal(profileBody.data.user.displayName, 'Updated User');

    const passwordResponse = await request(server, '/api/auth/password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        currentPassword: 'StrongPass123',
        newPassword: 'EvenStronger456'
      })
    });

    assert.equal(passwordResponse.status, 200);

    const loginWithOldPassword = await request(server, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'profile@example.com',
        password: 'StrongPass123'
      })
    });

    assert.equal(loginWithOldPassword.status, 401);

    const loginWithNewPassword = await request(server, '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'profile@example.com',
        password: 'EvenStronger456'
      })
    });

    assert.equal(loginWithNewPassword.status, 200);
  } finally {
    await DatabaseService.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
