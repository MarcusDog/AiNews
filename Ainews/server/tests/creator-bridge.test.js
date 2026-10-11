const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const { CreatorSourceRegistry } = require('../services/creators/creator-source-registry');
const {
  BridgeVerifier,
  secureSignatureEqual
} = require('../services/creators/bridge-verifier');
const { createCreatorIngestRouter } = require('../routes/creator-ingest');

const NOW = '2026-08-28T08:00:00.000Z';
const NOW_SECONDS = Math.floor(Date.parse(NOW) / 1000);
const SOURCE_ID = 'xiaohongshu-operator';
const SECRET = 'test-only-bridge-secret';

function bridgeEnv() {
  return {
    AYA_CREATOR_BRIDGES_JSON: JSON.stringify([{
      id: SOURCE_ID,
      adapter: 'xiaohongshu-mcp',
      secretEnv: 'AYA_CREATOR_BRIDGE_XHS_SECRET',
      bindings: [{ platform: 'xiaohongshu', externalAccountId: 'xhs-user-1' }]
    }]),
    AYA_CREATOR_BRIDGE_XHS_SECRET: SECRET
  };
}

function payload(overrides = {}) {
  return {
    version: 1,
    platform: 'xiaohongshu',
    externalAccountId: 'xhs-user-1',
    nextCursor: 'cursor-page-2',
    exhausted: false,
    items: [{
      externalPostId: 'note-1',
      url: 'https://www.xiaohongshu.com/explore/note-1',
      title: '真实公开笔记',
      text: '公开正文',
      contentType: 'image',
      publishedAt: '2026-08-28T07:30:00.000Z',
      language: 'zh-CN',
      visibility: 'public',
      metrics: { likes: 80, comments: 12, shares: null },
      token: 'must-not-persist',
      unknownRaw: { Cookie: 'must-not-persist' }
    }],
    Authorization: 'must-not-persist',
    ...overrides
  };
}

function sign(rawBody, { timestamp = NOW_SECONDS, nonce = 'nonce-0001', secret = SECRET } = {}) {
  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const signature = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${digest}`)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-aya-source-id': SOURCE_ID,
    'x-aya-timestamp': String(timestamp),
    'x-aya-nonce': nonce,
    'x-aya-signature': `sha256=${signature}`
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-bridge-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  store.syncVerticals([{
    id: 'beauty', name: '美妆', version: 'vertical-v1', enabled: true,
    keywords: ['护肤'], negativeKeywords: [], createdAt: NOW
  }]);
  store.upsertCreators([{
    id: 'creator-xhs-1', displayName: 'Verified XHS Creator', kind: 'person',
    reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['beauty']
  }]);
  store.upsertAccounts([{
    id: 'account-xhs-1', creatorId: 'creator-xhs-1', platform: 'xiaohongshu',
    externalAccountId: 'xhs-user-1', handle: 'verified-xhs',
    profileUrl: 'https://www.xiaohongshu.com/user/profile/xhs-user-1', region: 'cn',
    sourceTier: 'L4', enabled: true, lastVerifiedAt: NOW, authState: 'sidecar_required'
  }]);
  const registry = new CreatorSourceRegistry({ env: bridgeEnv(), now: () => NOW });
  const verifier = new BridgeVerifier({ sourceRegistry: registry, now: () => Date.parse(NOW) });
  const app = express();
  app.use('/api/ingest/v1/creator-bridge', createCreatorIngestRouter({
    creatorStore: store,
    sourceRegistry: registry,
    verifier,
    now: () => NOW
  }));
  app.use(express.json());
  return {
    directory, store, registry, verifier, app,
    close() {
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function postRaw(app, rawBody, headers) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ingest/v1/creator-bridge`, {
      method: 'POST', headers, body: rawBody
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('signature comparison executes a fixed-length timing-safe path for malformed input', () => {
  let calls = 0;
  const compare = (left, right) => {
    calls += 1;
    assert.equal(left.length, 32);
    assert.equal(right.length, 32);
    return crypto.timingSafeEqual(left, right);
  };
  assert.equal(secureSignatureEqual('not-a-signature', Buffer.alloc(32), compare), false);
  assert.equal(calls, 1);
});

test('verifier accepts exact raw bytes and rejects wrong signatures, stale requests and unknown sources', () => {
  const current = fixture();
  try {
    const rawBody = Buffer.from(JSON.stringify(payload(), null, 2));
    assert.equal(current.verifier.verify({ rawBody, headers: sign(rawBody) }).source.id, SOURCE_ID);
    assert.throws(
      () => current.verifier.verify({ rawBody, headers: sign(rawBody, { secret: 'wrong' }) }),
      /invalid_signature/
    );
    assert.throws(
      () => current.verifier.verify({
        rawBody,
        headers: sign(rawBody, { timestamp: NOW_SECONDS - 301 })
      }),
      /stale_timestamp/
    );
    assert.throws(
      () => current.verifier.verify({
        rawBody,
        headers: { ...sign(rawBody), 'x-aya-source-id': 'unknown-source' }
      }),
      /unknown_source/
    );
  } finally {
    current.close();
  }
});

test('signature is bound to the exact body hash, including equivalent JSON whitespace and key order', () => {
  const current = fixture();
  try {
    const pretty = Buffer.from(JSON.stringify(payload(), null, 2));
    const compact = Buffer.from(JSON.stringify(payload()));
    assert.throws(
      () => current.verifier.verify({ rawBody: compact, headers: sign(pretty) }),
      /invalid_signature/
    );
  } finally {
    current.close();
  }
});

test('invalid HMAC reaches the raw route but writes no nonce, run, post or payload', async () => {
  const current = fixture();
  try {
    const rawBody = Buffer.from(JSON.stringify(payload()));
    const response = await postRaw(current.app, rawBody, sign(rawBody, { secret: 'wrong-secret' }));
    assert.equal(response.status, 401);
    for (const table of [
      'creator_bridge_nonces', 'creator_runs', 'creator_posts', 'creator_bridge_payloads'
    ]) {
      assert.equal(current.store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, table);
    }
  } finally {
    current.close();
  }
});

test('valid raw route commits the nonce, run, post, allowlisted payload and post link atomically', async () => {
  const current = fixture();
  try {
    const rawBody = Buffer.from(JSON.stringify(payload(), null, 2));
    const response = await postRaw(current.app, rawBody, sign(rawBody));
    assert.equal(response.status, 202);
    assert.deepEqual(response.body.result, {
      accepted: 1, updated: 0, rejected: 0, nextExpectedCursor: 'cursor-page-2'
    });
    const sourceState = current.registry.list().find((item) => item.id === SOURCE_ID);
    assert.equal(sourceState.status, 'online');
    assert.equal(sourceState.lastSuccessAt, NOW);
    for (const table of [
      'creator_bridge_nonces', 'creator_runs', 'creator_posts',
      'creator_bridge_payloads', 'creator_bridge_payload_posts'
    ]) {
      assert.equal(current.store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1, table);
    }
    const stored = current.store.db.prepare(
      'SELECT payload_json FROM creator_bridge_payloads'
    ).get();
    assert(!/Cookie|Authorization|token|secret|signature|unknownRaw/i.test(stored.payload_json));
    assert.deepEqual(JSON.parse(stored.payload_json).items[0], {
      externalPostId: 'note-1',
      url: 'https://www.xiaohongshu.com/explore/note-1',
      title: '真实公开笔记',
      text: '公开正文',
      contentType: 'image',
      publishedAt: '2026-08-28T07:30:00.000Z',
      editedAt: null,
      language: 'zh-CN',
      metrics: {
        views: null, likes: 80, comments: 12, shares: null, bookmarks: null,
        platformRank: null, followersAtCapture: null
      }
    });
  } finally {
    current.close();
  }
});

test('duplicate and concurrent nonce replay permits exactly one commit', async () => {
  const current = fixture();
  try {
    const rawBody = Buffer.from(JSON.stringify(payload()));
    const headers = sign(rawBody, { nonce: 'same-nonce' });
    const responses = await Promise.all([
      postRaw(current.app, rawBody, headers),
      postRaw(current.app, rawBody, headers)
    ]);
    assert.deepEqual(responses.map((item) => item.status).sort(), [202, 409]);
    assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_nonces').get().count, 1);
    assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payloads').get().count, 1);
  } finally {
    current.close();
  }
});

test('a post persistence failure rolls back the nonce, run and every bridge row', async () => {
  const current = fixture();
  try {
    const currentPayload = payload({
      items: [{ ...payload().items[0], verticalIds: ['vertical-does-not-exist'] }]
    });
    const rawBody = Buffer.from(JSON.stringify(currentPayload));
    const response = await postRaw(current.app, rawBody, sign(rawBody, { nonce: 'rollback-nonce-1' }));
    assert.equal(response.status, 500);
    for (const table of [
      'creator_bridge_nonces', 'creator_runs', 'creator_posts',
      'creator_bridge_payloads', 'creator_bridge_payload_posts'
    ]) {
      assert.equal(current.store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, table);
    }
  } finally {
    current.close();
  }
});

test('schema, batch size, private, deleted and unbound account failures write no rows', async () => {
  const cases = [
    payload({ items: 'not-an-array' }),
    payload({ items: Array.from({ length: 501 }, (_, index) => ({ ...payload().items[0], externalPostId: `note-${index}` })) }),
    payload({ items: [{ ...payload().items[0], visibility: 'private' }] }),
    payload({ items: [{ ...payload().items[0], deletedAt: NOW }] }),
    payload({ externalAccountId: 'not-allowed' })
  ];
  for (const [index, currentPayload] of cases.entries()) {
    const current = fixture();
    try {
      const rawBody = Buffer.from(JSON.stringify(currentPayload));
      const response = await postRaw(current.app, rawBody, sign(rawBody, { nonce: `invalid-${index}` }));
      assert([403, 422].includes(response.status), `${index}: ${response.status}`);
      assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payloads').get().count, 0);
      assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count, 0);
      assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_runs').get().count, 0);
    } finally {
      current.close();
    }
  }
});

test('raw parser rejects bodies above two MiB before verification or persistence', async () => {
  const current = fixture();
  try {
    const rawBody = Buffer.alloc(2 * 1024 * 1024 + 1, 'x');
    const response = await postRaw(current.app, rawBody, sign(rawBody, { nonce: 'oversized-body-1' }));
    assert.equal(response.status, 413);
    assert.equal(response.body.error, 'payload_too_large');
    assert.equal(current.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_nonces').get().count, 0);
  } finally {
    current.close();
  }
});

test('source registry redacts secrets and documents only explicitly bound Sidecars', () => {
  const registry = new CreatorSourceRegistry({ env: bridgeEnv() });
  const serialized = JSON.stringify(registry.list());
  assert(!serialized.includes(SECRET));
  assert(!serialized.includes('AYA_CREATOR_BRIDGE_XHS_SECRET'));
  const source = registry.list().find((item) => item.id === SOURCE_ID);
  assert.deepEqual(source.allowedPlatforms, ['xiaohongshu']);
  assert.equal(source.bindingCount, 1);
  assert.equal(source.adapter, 'xiaohongshu-mcp');
});

test('server mounts the raw Bridge parser before the global JSON parser', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const bridgeIndex = source.indexOf("'/api/ingest/v1/creator-bridge'");
  const jsonIndex = source.indexOf('app.use(express.json(');
  assert(bridgeIndex >= 0);
  assert(bridgeIndex < jsonIndex);
  assert.match(source, /express\.raw\([\s\S]*application\/json[\s\S]*2mb/);
});
