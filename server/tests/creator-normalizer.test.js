const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCreatorPage,
  normalizeCreatorPost
} = require('../services/creators/creator-normalizer');
const {
  canonicalizeCreatorUrl,
  createStableId,
  normalizeOpaqueCursor
} = require('../services/creators/connectors/connector-utils');

const NOW = '2026-08-28T12:00:00.000Z';
const ACCOUNT = {
  id: 'youtube:UC_verified',
  creatorId: 'creator-verified',
  platform: 'youtube',
  externalAccountId: 'UC_verified',
  profileUrl: 'https://www.youtube.com/channel/UC_verified'
};

function rawPost(overrides = {}) {
  return {
    externalPostId: 'video-123',
    url: 'https://www.youtube.com/watch?v=video-123&utm_source=feed#comments',
    title: 'A verified creator post',
    text: 'Public summary',
    contentType: 'video',
    publishedAt: '2026-08-28T11:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    language: 'en',
    verticalIds: ['ai-tech'],
    sourceConfidence: 'official',
    provenanceUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_verified',
    metrics: {
      views: 1200,
      likes: 80,
      comments: 12
    },
    ...overrides
  };
}

test('normalizes a strict connector page without inventing unavailable metrics', () => {
  const page = normalizeCreatorPage({
    account: ACCOUNT,
    posts: [rawPost()],
    nextCursor: 'opaque+/=cursor:2',
    exhausted: false,
    rateLimit: { remaining: 42, resetAt: '2026-08-28T13:00:00.000Z' },
    collectedAt: NOW
  }, { now: NOW });

  assert.equal(page.account.externalAccountId, 'UC_verified');
  assert.equal(page.posts.length, 1);
  assert.match(page.posts[0].id, /^creator-post_/);
  assert.equal(page.posts[0].url, 'https://www.youtube.com/watch?v=video-123');
  assert.deepEqual(page.posts[0].metrics, {
    views: 1200,
    likes: 80,
    comments: 12,
    shares: null,
    bookmarks: null,
    platformRank: null,
    followersAtCapture: null
  });
  assert.equal(page.nextCursor, 'opaque+/=cursor:2');
  assert.equal(page.exhausted, false);
  assert.equal(page.collectedAt, NOW);
});

test('stable identities are deterministic and platform scoped', () => {
  const first = createStableId('creator-post', ['youtube', 'video-123']);
  assert.equal(first, createStableId('creator-post', ['youtube', 'video-123']));
  assert.notEqual(first, createStableId('creator-post', ['bluesky', 'video-123']));
  assert.match(first, /^creator-post_[a-f0-9]{32}$/);
});

test('rejects malformed, credential-bearing and non-HTTPS public URLs', () => {
  assert.equal(canonicalizeCreatorUrl('not a url'), null);
  assert.equal(canonicalizeCreatorUrl('javascript:alert(1)'), null);
  assert.equal(canonicalizeCreatorUrl('http://example.com/post/1'), null);
  assert.equal(canonicalizeCreatorUrl('https://user:secret@example.com/post/1'), null);
  assert.throws(() => normalizeCreatorPost(rawPost({ url: 'javascript:alert(1)' }), ACCOUNT, { now: NOW }), /URL/);
});

test('accepts small clock skew but rejects implausible future publish times', () => {
  const tolerated = normalizeCreatorPost(rawPost({ publishedAt: '2026-08-28T12:05:00.000Z' }), ACCOUNT, { now: NOW });
  assert.equal(tolerated.publishedAt, '2026-08-28T12:05:00.000Z');
  assert.throws(
    () => normalizeCreatorPost(rawPost({ publishedAt: '2026-08-28T13:00:00.000Z' }), ACCOUNT, { now: NOW }),
    /future/i
  );
});

test('preserves edit and deletion tombstones without fabricating content', () => {
  const edited = normalizeCreatorPost(rawPost({
    editedAt: '2026-08-28T11:30:00.000Z'
  }), ACCOUNT, { now: NOW });
  assert.equal(edited.editedAt, '2026-08-28T11:30:00.000Z');

  const deleted = normalizeCreatorPost(rawPost({
    title: '',
    text: '',
    deletedAt: '2026-08-28T11:45:00.000Z',
    metrics: null
  }), ACCOUNT, { now: NOW });
  assert.equal(deleted.deletedAt, '2026-08-28T11:45:00.000Z');
  assert.equal(deleted.title, '');
  assert.equal(deleted.text, '');
  assert.equal(deleted.metrics.views, null);
});

test('keeps shared-post attribution separate from the watching account', () => {
  const post = normalizeCreatorPost(rawPost({
    sharedFrom: {
      platform: 'youtube',
      externalAccountId: 'UC_original',
      externalPostId: 'original-99',
      url: 'https://www.youtube.com/watch?v=original-99',
      displayName: 'Original Creator',
      authorization: 'must-not-survive'
    }
  }), ACCOUNT, { now: NOW });

  assert.equal(post.accountId, ACCOUNT.id);
  assert.deepEqual(post.sharedFrom, {
    platform: 'youtube',
    externalAccountId: 'UC_original',
    externalPostId: 'original-99',
    url: 'https://www.youtube.com/watch?v=original-99',
    displayName: 'Original Creator'
  });
  assert.equal(JSON.stringify(post).includes('authorization'), false);
});

test('normalizes carousel and thread parts through a bounded public allowlist', () => {
  const post = normalizeCreatorPost(rawPost({
    contentType: 'thread',
    contentParts: [
      { type: 'text', text: 'Part one', url: 'https://example.com/post/1?slide=1', cookie: 'secret' },
      { type: 'image', text: 'Part two', url: 'https://example.com/post/1?slide=2', headers: { authorization: 'secret' } }
    ]
  }), ACCOUNT, { now: NOW });

  assert.deepEqual(post.contentParts, [
    { type: 'text', text: 'Part one', url: 'https://example.com/post/1?slide=1' },
    { type: 'image', text: 'Part two', url: 'https://example.com/post/1?slide=2' }
  ]);
  assert.equal(JSON.stringify(post).includes('secret'), false);
});

test('drops untrusted raw fields and retains only declared public metadata', () => {
  const post = normalizeCreatorPost(rawPost({
    raw: {
      cookie: 'session=secret',
      authorization: 'Bearer secret',
      token: 'secret',
      headers: { signature: 'secret' }
    },
    metadata: {
      mediaCount: 3,
      isPinned: true,
      isSponsored: false,
      etag: 'public-etag',
      arbitrary: 'drop-me',
      secret: 'drop-me'
    }
  }), ACCOUNT, { now: NOW });

  assert.equal('raw' in post, false);
  assert.deepEqual(post.metadata, {
    mediaCount: 3,
    isPinned: true,
    isSponsored: false,
    etag: 'public-etag'
  });
  assert.equal(JSON.stringify(post).includes('secret'), false);
  assert.equal(JSON.stringify(post).includes('drop-me'), false);
});

test('opaque cursors are preserved exactly and unsafe cursor shapes are rejected', () => {
  assert.equal(normalizeOpaqueCursor('  cursor+/=:value  '), '  cursor+/=:value  ');
  assert.equal(normalizeOpaqueCursor(null), null);
  assert.throws(() => normalizeOpaqueCursor({ page: 2 }), /cursor/i);
  assert.throws(() => normalizeOpaqueCursor(`page\n2`), /cursor/i);
});
