const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const YoutubeWebSubService = require('../services/creators/youtube-websub-service');
const { createYoutubeWebSubRouter } = require('../routes/youtube-websub');

const NOW = '2026-08-28T12:00:00.000Z';
const CHANNEL_ID = 'UC_verified_websub';
const TOPIC = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const SECRET = 'unit-test-websub-secret';

function notificationXml(overrides = {}) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <link rel="self" href="${TOPIC}"/>
    <entry><yt:videoId>${overrides.videoId || 'video-1'}</yt:videoId><yt:channelId>${overrides.channelId || CHANNEL_ID}</yt:channelId>
      <title>${overrides.title || 'A new creator video'}</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=${overrides.videoId || 'video-1'}"/>
      <published>2026-08-28T10:00:00Z</published><updated>${overrides.updatedAt || '2026-08-28T10:05:00Z'}</updated>
    </entry>
  </feed>`, 'utf8');
}

function repositoryFixture() {
  const account = {
    id: `youtube:${CHANNEL_ID}`,
    creatorId: 'creator-websub',
    platform: 'youtube',
    externalAccountId: CHANNEL_ID,
    profileUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    verticalIds: ['ai-tech'],
    backfillState: 'running'
  };
  const subscriptions = new Map([[TOPIC, {
    id: 'subscription-1',
    accountId: account.id,
    channelId: CHANNEL_ID,
    topic: TOPIC,
    secretRef: 'TEST_WEBSUB_SECRET',
    status: 'pending',
    leaseExpiresAt: null
  }]]);
  const receipts = new Set();
  const committed = [];
  return {
    account,
    subscriptions,
    receipts,
    committed,
    findVerifiedAccountByChannelId(channelId) {
      return channelId === CHANNEL_ID ? account : null;
    },
    getSubscriptionByTopic(topic) {
      return subscriptions.get(topic) || null;
    },
    listSubscriptions() {
      return [...subscriptions.values()];
    },
    saveSubscription(value) {
      subscriptions.set(value.topic, { ...subscriptions.get(value.topic), ...value });
      return subscriptions.get(value.topic);
    },
    listDueSubscriptions() {
      return [...subscriptions.values()];
    },
    commitNotification({ receiptKeys, posts, account: committedAccount }) {
      const freshIndexes = receiptKeys
        .map((key, index) => ({ key, index }))
        .filter(({ key }) => !receipts.has(key));
      if (!freshIndexes.length) return { accepted: 0, duplicate: receiptKeys.length };
      for (const { key } of freshIndexes) receipts.add(key);
      const freshPosts = freshIndexes.map(({ index }) => posts[index]);
      committed.push({ account: committedAccount, posts: freshPosts });
      return { accepted: freshPosts.length, duplicate: receiptKeys.length - freshPosts.length };
    }
  };
}

function serviceFixture(options = {}) {
  const repository = repositoryFixture();
  const service = new YoutubeWebSubService({
    repository,
    env: { TEST_WEBSUB_SECRET: SECRET },
    now: () => NOW,
    allowLegacySignature: options.allowLegacySignature === true
  });
  return { service, repository };
}

async function listen(service) {
  const app = express();
  app.use('/api/ingest/v1/youtube/websub', createYoutubeWebSubRouter({ service }));
  app.use(express.json());
  const server = await new Promise((resolve) => {
    const current = app.listen(0, '127.0.0.1', () => resolve(current));
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function signature(algorithm, body) {
  return `${algorithm}=${crypto.createHmac(algorithm, SECRET).update(body).digest('hex')}`;
}

test('GET challenge persists an exact verified topic lease and rejects unknown channels', async () => {
  const { service, repository } = serviceFixture();
  const fixture = await listen(service);
  try {
    const query = new URLSearchParams({
      'hub.mode': 'subscribe', 'hub.topic': TOPIC, 'hub.challenge': 'challenge-value', 'hub.lease_seconds': '3600'
    });
    const response = await fetch(`${fixture.origin}/api/ingest/v1/youtube/websub?${query}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'challenge-value');
    const stored = repository.subscriptions.get(TOPIC);
    assert.equal(stored.status, 'active');
    assert.equal(stored.leaseExpiresAt, '2026-08-28T13:00:00.000Z');
    assert.equal(JSON.stringify(stored).includes(SECRET), false);

    query.set('hub.topic', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_unknown');
    const unknown = await fetch(`${fixture.origin}/api/ingest/v1/youtube/websub?${query}`);
    assert.equal(unknown.status, 404);
  } finally {
    await fixture.close();
  }
});

test('POST verifies exact raw bytes with SHA-256 before parsing and commits during backfill', async () => {
  const { service, repository } = serviceFixture();
  const fixture = await listen(service);
  const body = notificationXml();
  try {
    const response = await fetch(`${fixture.origin}/api/ingest/v1/youtube/websub`, {
      method: 'POST',
      headers: {
        'content-type': 'application/atom+xml',
        'x-hub-topic': TOPIC,
        'x-hub-signature-256': signature('sha256', body)
      },
      body
    });
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.deepEqual(payload, { success: true, accepted: 1, duplicate: 0 });
    assert.equal(repository.committed.length, 1);
    assert.equal(repository.committed[0].account.backfillState, 'running');
    assert.equal(repository.committed[0].posts[0].externalPostId, 'video-1');
    assert.equal(JSON.stringify(payload).includes(SECRET), false);
  } finally {
    await fixture.close();
  }
});

test('invalid signature and an XML channel mismatch write nothing', async () => {
  const { service, repository } = serviceFixture();
  const fixture = await listen(service);
  try {
    const invalid = await fetch(`${fixture.origin}/api/ingest/v1/youtube/websub`, {
      method: 'POST',
      headers: {
        'content-type': 'application/atom+xml', 'x-hub-topic': TOPIC,
        'x-hub-signature-256': 'sha256=00'
      },
      body: notificationXml()
    });
    assert.equal(invalid.status, 401);

    const wrongChannel = notificationXml({ channelId: 'UC_other' });
    const mismatch = await fetch(`${fixture.origin}/api/ingest/v1/youtube/websub`, {
      method: 'POST',
      headers: {
        'content-type': 'application/atom+xml', 'x-hub-topic': TOPIC,
        'x-hub-signature-256': signature('sha256', wrongChannel)
      },
      body: wrongChannel
    });
    assert.equal(mismatch.status, 400);
    assert.equal(repository.committed.length, 0);
    assert.equal(repository.receipts.size, 0);
  } finally {
    await fixture.close();
  }
});

test('legacy SHA-1 is rejected by default and accepted only with an explicit flag', async () => {
  const body = notificationXml();
  const disabledFixture = serviceFixture();
  const disabled = await listen(disabledFixture.service);
  try {
    const response = await fetch(`${disabled.origin}/api/ingest/v1/youtube/websub`, {
      method: 'POST',
      headers: { 'content-type': 'application/atom+xml', 'x-hub-topic': TOPIC, 'x-hub-signature': signature('sha1', body) },
      body
    });
    assert.equal(response.status, 401);
  } finally {
    await disabled.close();
  }

  const enabledFixture = serviceFixture({ allowLegacySignature: true });
  const enabled = await listen(enabledFixture.service);
  try {
    const response = await fetch(`${enabled.origin}/api/ingest/v1/youtube/websub`, {
      method: 'POST',
      headers: { 'content-type': 'application/atom+xml', 'x-hub-topic': TOPIC, 'x-hub-signature': signature('sha1', body) },
      body
    });
    assert.equal(response.status, 202);
  } finally {
    await enabled.close();
  }
});

test('duplicate callbacks are idempotent by channel, video and updated timestamp', async () => {
  const { service, repository } = serviceFixture();
  const body = notificationXml();
  const headers = { 'x-hub-topic': TOPIC, 'x-hub-signature-256': signature('sha256', body) };
  const first = await service.handleNotification({ rawBody: body, headers });
  const second = await service.handleNotification({ rawBody: body, headers });
  assert.deepEqual(first, { accepted: 1, duplicate: 0 });
  assert.deepEqual(second, { accepted: 0, duplicate: 1 });
  assert.equal(repository.committed.length, 1);
});

test('lease renewal asks only for due subscriptions and never exposes the secret', async () => {
  const { service, repository } = serviceFixture();
  const calls = [];
  const renewed = await service.renewDue({
    requestSubscription: async (request) => {
      calls.push(request);
      return { accepted: true };
    }
  });
  assert.equal(renewed.requested, 1);
  assert.equal(calls[0].topic, TOPIC);
  assert.equal(calls[0].callback.includes('/api/ingest/v1/youtube/websub'), true);
  assert.equal(JSON.stringify(calls).includes(SECRET), false);
  assert.equal(repository.subscriptions.get(TOPIC).status, 'pending');
});

test('hub subscription transport resolves the secret reference only inside the outbound request', async () => {
  const repository = repositoryFixture();
  const calls = [];
  const service = new YoutubeWebSubService({
    repository,
    env: { TEST_WEBSUB_SECRET: SECRET },
    now: () => NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response('', { status: 202 });
    }
  });
  const subscription = repository.subscriptions.get(TOPIC);
  const result = await service.requestSubscription({
    ...subscription,
    callback: 'https://ainews.xiaotianaya.com/api/ingest/v1/youtube/websub',
    mode: 'subscribe'
  });
  assert.deepEqual(result, { accepted: true, status: 202 });
  assert.equal(calls[0].url, 'https://pubsubhubbub.appspot.com/subscribe');
  assert.match(String(calls[0].options.body), /hub\.secret=unit-test-websub-secret/);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test('server mounts the raw WebSub route before global JSON parsing and schedules lease renewal', () => {
  const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const mountIndex = source.indexOf("app.use('/api/ingest/v1/youtube/websub'");
  const jsonIndex = source.indexOf("app.use(express.json({ limit: '10mb' }))");
  assert(mountIndex >= 0, 'WebSub route must be mounted');
  assert(jsonIndex >= 0 && mountIndex < jsonIndex, 'raw WebSub route must precede global JSON parsing');
  const { newsSchedules } = require('../config/schedules');
  assert.equal(newsSchedules.creatorWebSubRenewal, '17 */6 * * *');
});
