const test = require('node:test');
const assert = require('node:assert/strict');

const { adminAuth, isAdminKeyValid } = require('../middleware/adminAuth');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('admin key validation rejects empty and mismatched credentials', () => {
  assert.equal(isAdminKeyValid('', ''), false);
  assert.equal(isAdminKeyValid('configured-key', ''), false);
  assert.equal(isAdminKeyValid('configured-key', 'wrong-key'), false);
  assert.equal(isAdminKeyValid('configured-key', 'configured-key'), true);
});

test('admin middleware fails closed when no server key is configured', () => {
  const previous = process.env.ADMIN_API_KEY;
  delete process.env.ADMIN_API_KEY;
  const response = createResponse();
  let nextCalled = false;

  adminAuth({ get: () => '' }, response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 503);
  assert.equal(nextCalled, false);
  if (previous === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = previous;
});

test('admin middleware accepts only the x-admin-api-key header', () => {
  const previous = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'configured-key';
  const denied = createResponse();
  const allowed = createResponse();
  let nextCalled = false;

  adminAuth({ get: () => 'wrong-key' }, denied, () => {});
  adminAuth({ get: (name) => name === 'x-admin-api-key' ? 'configured-key' : '' }, allowed, () => { nextCalled = true; });

  assert.equal(denied.statusCode, 401);
  assert.equal(nextCalled, true);
  if (previous === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = previous;
});
