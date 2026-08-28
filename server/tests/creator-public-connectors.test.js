const test = require('node:test');
const assert = require('node:assert/strict');

const YoutubeFeedConnector = require('../services/creators/connectors/youtube-feed-connector');
const BlueskyConnector = require('../services/creators/connectors/bluesky-connector');
const MastodonAccountConnector = require('../services/creators/connectors/mastodon-account-connector');
const GithubCreatorConnector = require('../services/creators/connectors/github-creator-connector');
const RssCreatorConnector = require('../services/creators/connectors/rss-creator-connector');
const { createConnectorFetch, parseRetryAfter } = require('../services/creators/connectors/connector-utils');

const NOW = '2026-08-28T12:00:00.000Z';

function account(platform, overrides = {}) {
  const externalAccountId = overrides.externalAccountId || `${platform}-stable-id`;
  return {
    id: `${platform}:${externalAccountId}`,
    creatorId: `${platform}-creator`,
    platform,
    externalAccountId,
    handle: `${platform}-handle`,
    profileUrl: `https://example.com/${platform}-creator`,
    verticalIds: ['ai-tech'],
    ...overrides
  };
}

function fixtureFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls.length);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('YouTube Atom maps stable author/video identity, edits, URLs and null statistics', async () => {
  const xml = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <title>Lab Channel</title><entry><yt:videoId>vid-1</yt:videoId><yt:channelId>UC_verified</yt:channelId>
    <title>Useful video</title><link rel="alternate" href="https://www.youtube.com/watch?v=vid-1"/>
    <published>2026-08-28T10:00:00Z</published><updated>2026-08-28T10:30:00Z</updated></entry></feed>`;
  const fetchImpl = fixtureFetch(async () => new Response(xml, {
    status: 200,
    headers: { 'content-type': 'application/atom+xml', etag: 'yt-etag' }
  }));
  const connector = new YoutubeFeedConnector({ fetchImpl, now: () => NOW });
  const result = await connector.collect(account('youtube', {
    externalAccountId: 'UC_verified',
    profileUrl: 'https://www.youtube.com/channel/UC_verified',
    feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_verified'
  }));

  assert.equal(result.account.externalAccountId, 'UC_verified');
  assert.equal(result.posts[0].externalPostId, 'vid-1');
  assert.equal(result.posts[0].editedAt, '2026-08-28T10:30:00.000Z');
  assert.equal(result.posts[0].url, 'https://www.youtube.com/watch?v=vid-1');
  assert.equal(result.posts[0].metrics.views, null);
  assert.equal(result.nextCursor, 'yt-etag');
  assert.equal(result.exhausted, true);
});

test('YouTube Data API paginates upload history and statistics failure never drops posts', async () => {
  const fetchImpl = fixtureFetch(async (url) => {
    if (url.includes('/channels?')) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_verified' } } }] });
    if (url.includes('/playlistItems?')) return Response.json({
      nextPageToken: 'page-2',
      items: [{
        contentDetails: { videoId: 'history-1', videoPublishedAt: '2026-08-27T10:00:00Z' },
        snippet: { title: 'History video', description: 'Description' }
      }]
    });
    if (url.includes('/videos?')) return new Response('quota', { status: 403 });
    throw new Error(`unexpected URL ${url}`);
  });
  const connector = new YoutubeFeedConnector({ fetchImpl, apiKey: 'test-key', now: () => NOW });
  const result = await connector.collect(account('youtube', {
    externalAccountId: 'UC_verified',
    profileUrl: 'https://www.youtube.com/channel/UC_verified'
  }), { cursor: 'page-1', history: true });

  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].externalPostId, 'history-1');
  assert.equal(result.posts[0].metrics.views, null);
  assert.equal(result.nextCursor, 'page-2');
  assert.equal(result.exhausted, false);
});

test('Bluesky author feed preserves pagination and canonical repost attribution', async () => {
  const fetchImpl = fixtureFetch(async (url) => {
    assert.match(url, /app\.bsky\.feed\.getAuthorFeed/);
    assert.match(url, /cursor=cursor-1/);
    return Response.json({
      cursor: 'cursor-2',
      feed: [{
        post: {
          uri: 'at://did:plc:original/app.bsky.feed.post/rkey-1',
          author: { did: 'did:plc:original', handle: 'original.example', displayName: 'Original' },
          record: { text: 'A public thread', createdAt: '2026-08-28T09:00:00Z' },
          indexedAt: '2026-08-28T09:05:00Z', likeCount: 12, replyCount: 3, repostCount: 4
        },
        reason: { by: { did: 'did:plc:watched', handle: 'watched.example' }, indexedAt: '2026-08-28T09:10:00Z' }
      }]
    });
  });
  const connector = new BlueskyConnector({ fetchImpl, now: () => NOW });
  const result = await connector.collect(account('bluesky', {
    externalAccountId: 'did:plc:watched',
    handle: 'watched.example',
    profileUrl: 'https://bsky.app/profile/did:plc:watched'
  }), { cursor: 'cursor-1' });

  assert.equal(result.nextCursor, 'cursor-2');
  assert.equal(result.posts[0].externalPostId, 'at://did:plc:original/app.bsky.feed.post/rkey-1');
  assert.equal(result.posts[0].sharedFrom.externalAccountId, 'did:plc:original');
  assert.equal(result.posts[0].url, 'https://bsky.app/profile/did:plc:original/post/rkey-1');
  assert.equal(result.posts[0].metrics.shares, 4);
});

test('Mastodon resolves a public account, paginates statuses and strips HTML', async () => {
  const fetchImpl = fixtureFetch(async (url) => {
    if (url.includes('/accounts/lookup')) return Response.json({ id: '42', acct: 'creator@example.social' });
    if (url.includes('/accounts/42/statuses')) {
      assert.match(url, /max_id=100/);
      return Response.json([{
        id: '99', url: 'https://example.social/@creator/99', content: '<p>Hello <strong>world</strong></p>',
        created_at: '2026-08-28T08:00:00Z', edited_at: null, replies_count: 5,
        reblogs_count: 6, favourites_count: 7, language: 'en', reblog: null
      }], { headers: { link: '<https://example.social/api/v1/accounts/42/statuses?max_id=99>; rel="next"' } });
    }
    throw new Error(`unexpected URL ${url}`);
  });
  const connector = new MastodonAccountConnector({ fetchImpl, now: () => NOW });
  const result = await connector.collect(account('mastodon', {
    externalAccountId: 'creator@example.social',
    profileUrl: 'https://example.social/@creator',
    instanceUrl: 'https://example.social'
  }), { cursor: '100' });

  assert.equal(result.posts[0].text, 'Hello world');
  assert.equal(result.posts[0].metrics.comments, 5);
  assert.equal(result.posts[0].metrics.shares, 6);
  assert.equal(result.nextCursor, '99');
  assert.equal(result.exhausted, false);
});

test('GitHub creator connector returns repositories, releases and public events with an opaque cursor', async () => {
  const fetchImpl = fixtureFetch(async (url) => {
    if (url.includes('/orgs/openai/repos')) return Response.json([{
      id: 10, full_name: 'openai/example', html_url: 'https://github.com/openai/example',
      name: 'example', description: 'Example repository', created_at: '2026-08-20T00:00:00Z',
      pushed_at: '2026-08-28T07:00:00Z', stargazers_count: 100, forks_count: 10, open_issues_count: 2
    }], { headers: { etag: 'repos-etag', 'x-ratelimit-remaining': '42', 'x-ratelimit-reset': '1787922000' } });
    if (url.includes('/repos/openai/example/releases')) return Response.json([{
      id: 11, tag_name: 'v1.0.0', name: 'Version 1', html_url: 'https://github.com/openai/example/releases/tag/v1.0.0',
      body: 'Release notes', published_at: '2026-08-28T06:00:00Z'
    }], { headers: { etag: 'release-etag' } });
    if (url.includes('/users/openai/events/public')) return Response.json([{
      id: 'event-12', type: 'PushEvent', created_at: '2026-08-28T05:00:00Z',
      repo: { name: 'openai/example', url: 'https://api.github.com/repos/openai/example' }
    }], { headers: { etag: 'events-etag' } });
    throw new Error(`unexpected URL ${url}`);
  });
  const connector = new GithubCreatorConnector({ fetchImpl, now: () => NOW });
  const result = await connector.collect(account('github', {
    externalAccountId: '14957082', handle: 'openai', profileUrl: 'https://github.com/openai',
    accountType: 'organization', repositories: ['openai/example']
  }));

  assert.deepEqual(result.posts.map((post) => post.contentType).sort(), ['post', 'repository', 'repository']);
  assert(result.posts.some((post) => post.url.endsWith('/releases/tag/v1.0.0')));
  assert.match(result.nextCursor, /^github:/);
  assert.equal(result.posts.find((post) => post.externalPostId === 'repo:10').metrics.likes, 100);
  assert.equal(result.rateLimit.remaining, 42);
  assert.equal(result.rateLimit.resetAt, '2026-08-28T13:00:00.000Z');
});

test('RSS connector uses conditional requests, GUID identity and zero-result success', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Creator Feed</title><link>https://creator.example</link>
    <item><guid>post-guid-1</guid><title>Fresh article</title><link>https://creator.example/post/1</link>
    <description>Public summary</description><pubDate>Fri, 28 Aug 2026 04:00:00 GMT</pubDate></item></channel></rss>`;
  const fetchImpl = fixtureFetch(async (_url, options) => {
    assert.equal(options.headers['if-none-match'], 'old-etag');
    return new Response(xml, { status: 200, headers: { etag: 'new-etag', 'last-modified': 'Fri, 28 Aug 2026 04:01:00 GMT' } });
  });
  const connector = new RssCreatorConnector({ fetchImpl, now: () => NOW });
  const result = await connector.collect(account('rss', {
    externalAccountId: 'https://creator.example/feed.xml',
    profileUrl: 'https://creator.example', feedUrl: 'https://creator.example/feed.xml'
  }), { cursor: 'rss:eyJldGFnIjoib2xkLWV0YWcifQ' });

  assert.equal(result.posts[0].externalPostId, 'post-guid-1');
  assert.equal(result.posts[0].publishedAt, '2026-08-28T04:00:00.000Z');
  assert.equal(result.posts[0].metrics.views, null);
  assert.match(result.nextCursor, /^rss:/);

  const emptyConnector = new RssCreatorConnector({
    fetchImpl: async () => new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>'),
    now: () => NOW
  });
  const empty = await emptyConnector.collect(account('rss', {
    externalAccountId: 'https://empty.example/feed', profileUrl: 'https://empty.example', feedUrl: 'https://empty.example/feed'
  }));
  assert.deepEqual(empty.posts, []);
  assert.equal(empty.exhausted, true);
});

test('Retry-After supports seconds and HTTP dates without fabricating a delay', () => {
  assert.equal(parseRetryAfter('30', new Date(NOW)), 30000);
  assert.equal(parseRetryAfter('Fri, 28 Aug 2026 12:01:00 GMT', new Date(NOW)), 60000);
  assert.equal(parseRetryAfter('invalid', new Date(NOW)), null);
});

test('public connectors abort bounded requests instead of hanging', async () => {
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const connector = new BlueskyConnector({ fetchImpl, now: () => NOW, timeoutMs: 5 });
  await assert.rejects(
    connector.collect(account('bluesky', {
      externalAccountId: 'did:plc:timeout', profileUrl: 'https://bsky.app/profile/did:plc:timeout'
    })),
    /timed out|timeout/i
  );
});

test('default connector fetch honors standard proxy environment without exposing its URL', async () => {
  const calls = [];
  class FakeProxyAgent {
    constructor(url) {
      this.url = url;
    }
  }
  const wrapped = createConnectorFetch({
    env: { HTTPS_PROXY: 'http://127.0.0.1:7897' },
    ProxyAgentClass: FakeProxyAgent,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response('ok');
    }
  });
  const response = await wrapped('https://www.youtube.com/feeds/videos.xml');
  assert.equal(response.status, 200);
  assert.equal(calls[0].options.dispatcher.url, 'http://127.0.0.1:7897');
  assert.equal(JSON.stringify({ status: response.status }).includes('7897'), false);
});
