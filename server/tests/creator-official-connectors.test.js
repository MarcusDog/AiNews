const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RedditConnector = require('../services/creators/connectors/reddit-connector');
const XConnector = require('../services/creators/connectors/x-connector');
const InstagramConnector = require('../services/creators/connectors/instagram-connector');
const DouyinAuthorizedConnector = require('../services/creators/connectors/douyin-authorized-connector');
const {
  CreatorSourceRegistry,
  buildCreatorSourceCatalog
} = require('../services/creators/creator-source-registry');

const NOW = '2026-08-28T12:00:00.000Z';

function account(platform, overrides = {}) {
  return {
    id: `${platform}:stable-account`,
    creatorId: `${platform}-creator`,
    platform,
    externalAccountId: `${platform}-stable-account`,
    handle: `${platform}-creator`,
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

test('missing official credentials return unconfigured with zero network calls', async () => {
  const fetchImpl = fixtureFetch(async () => { throw new Error('network must not be called'); });
  const connectors = [
    new RedditConnector({ env: {}, fetchImpl, now: () => NOW }),
    new XConnector({ env: {}, fetchImpl, now: () => NOW }),
    new InstagramConnector({ env: {}, fetchImpl, now: () => NOW }),
    new DouyinAuthorizedConnector({ env: {}, fetchImpl, now: () => NOW })
  ];
  for (const connector of connectors) {
    const result = await connector.collect(account(connector.platform));
    assert.deepEqual(result, { status: 'unconfigured', posts: [] });
  }
  assert.equal(fetchImpl.calls.length, 0);
});

test('Reddit OAuth paginates a verified user submitted feed and keeps credentials out of posts', async () => {
  const fetchImpl = fixtureFetch(async (url, options) => {
    if (url.includes('/api/v1/access_token')) {
      assert.match(options.headers.authorization, /^Basic /);
      return Response.json({ access_token: 'runtime-access-token', token_type: 'bearer', expires_in: 3600 });
    }
    assert.match(url, /\/user\/creator\/submitted/);
    assert.match(url, /after=t3_old/);
    assert.equal(options.headers.authorization, 'Bearer runtime-access-token');
    return Response.json({ data: { after: 't3_next', children: [{ data: {
      name: 't3_post1', title: 'A creator post', selftext: 'Public body', permalink: '/r/ai/comments/post1',
      created_utc: 1787914800, score: 120, num_comments: 20, upvote_ratio: 0.91
    } }] } });
  });
  const connector = new RedditConnector({
    env: { REDDIT_CLIENT_ID: 'client-id', REDDIT_CLIENT_SECRET: 'client-secret' },
    fetchImpl, now: () => NOW
  });
  const result = await connector.collect(account('reddit', {
    externalAccountId: 't2_stable_creator_id', handle: 'creator', profileUrl: 'https://www.reddit.com/user/creator'
  }), { cursor: 't3_old' });

  assert.equal(result.posts[0].externalPostId, 't3_post1');
  assert.equal(result.posts[0].url, 'https://www.reddit.com/r/ai/comments/post1');
  assert.equal(result.posts[0].metrics.likes, 120);
  assert.equal(result.nextCursor, 't3_next');
  assert.equal(JSON.stringify(result).includes('client-secret'), false);
  assert.equal(JSON.stringify(result).includes('runtime-access-token'), false);
});

test('X user timeline uses the stable user id and exposes only public metrics', async () => {
  const fetchImpl = fixtureFetch(async (url, options) => {
    assert.match(url, /\/2\/users\/2244994945\/tweets/);
    assert.match(url, /pagination_token=next-1/);
    assert.equal(options.headers.authorization, 'Bearer x-secret');
    return Response.json({
      data: [{
        id: 'tweet-1', text: 'New AI product', created_at: '2026-08-28T10:00:00Z', lang: 'en',
        public_metrics: { like_count: 20, reply_count: 3, retweet_count: 4, quote_count: 2, impression_count: 900 }
      }],
      meta: { next_token: 'next-2' }
    });
  });
  const connector = new XConnector({ env: { X_BEARER_TOKEN: 'x-secret' }, fetchImpl, now: () => NOW });
  const result = await connector.collect(account('x', {
    externalAccountId: '2244994945', handle: 'creator', profileUrl: 'https://x.com/creator'
  }), { cursor: 'next-1' });

  assert.equal(result.posts[0].url, 'https://x.com/creator/status/tweet-1');
  assert.deepEqual(result.posts[0].metrics, {
    views: 900, likes: 20, comments: 3, shares: 6,
    bookmarks: null, platformRank: null, followersAtCapture: null
  });
  assert.equal(result.nextCursor, 'next-2');
});

test('Instagram Business Discovery maps only eligible public professional media', async () => {
  const fetchImpl = fixtureFetch(async (url) => {
    assert.match(decodeURIComponent(url), /business_discovery\.username\(creator\)/);
    assert.match(decodeURIComponent(url), /after\(ig-next\)/);
    return Response.json({ business_discovery: {
      id: 'ig-business-1', username: 'creator', followers_count: 50000,
      media: {
        data: [{
          id: 'media-1', caption: 'A beauty launch', media_type: 'IMAGE',
          permalink: 'https://www.instagram.com/p/media-1/', timestamp: '2026-08-28T09:00:00Z',
          like_count: 1000, comments_count: 40
        }],
        paging: { cursors: { after: 'ig-next-2' }, next: 'https://graph.facebook.com/next' }
      }
    } });
  });
  const connector = new InstagramConnector({
    env: { INSTAGRAM_ACCESS_TOKEN: 'ig-secret', INSTAGRAM_BUSINESS_ACCOUNT_ID: 'viewer-business-id' },
    fetchImpl, now: () => NOW
  });
  const result = await connector.collect(account('instagram', {
    externalAccountId: 'ig-business-1', handle: 'creator', profileUrl: 'https://www.instagram.com/creator/'
  }), { cursor: 'ig-next' });

  assert.equal(result.posts[0].externalPostId, 'media-1');
  assert.equal(result.posts[0].contentType, 'image');
  assert.equal(result.posts[0].metrics.followersAtCapture, 50000);
  assert.equal(result.nextCursor, 'ig-next-2');
  assert.equal(JSON.stringify(result).includes('ig-secret'), false);
});

test('Douyin video.list is restricted to the account that granted authorization', async () => {
  const fetchImpl = fixtureFetch(async (url, options) => {
    assert.match(url, /open_id=authorized-open-id/);
    assert.match(url, /cursor=10/);
    assert.equal(options.headers['access-token'], 'douyin-secret');
    return Response.json({ data: {
      cursor: 20, has_more: true,
      list: [{
        item_id: 'video-1', title: '今日 AI 新工具', create_time: 1787911200,
        video_status: 1, share_url: 'https://www.douyin.com/video/video-1',
        statistics: { play_count: 10000, digg_count: 800, comment_count: 60, share_count: 90 }
      }]
    } });
  });
  const connector = new DouyinAuthorizedConnector({
    env: { DOUYIN_ACCESS_TOKEN: 'douyin-secret', DOUYIN_OPEN_ID: 'authorized-open-id' },
    fetchImpl, now: () => NOW
  });
  const result = await connector.collect(account('douyin', {
    externalAccountId: 'authorized-open-id', handle: '创作者', profileUrl: 'https://www.douyin.com/user/authorized-open-id'
  }), { cursor: '10' });
  assert.equal(result.posts[0].externalPostId, 'video-1');
  assert.equal(result.posts[0].metrics.views, 10000);
  assert.equal(result.nextCursor, '20');

  const before = fetchImpl.calls.length;
  await assert.rejects(
    connector.collect(account('douyin', {
      externalAccountId: 'somebody-else', profileUrl: 'https://www.douyin.com/user/somebody-else'
    })),
    (error) => error.code === 'permission_missing'
  );
  assert.equal(fetchImpl.calls.length, before);
});

test('registry classifies auth, rate-limit and permission failures while preserving prior success', async () => {
  let current = 'success';
  const registry = new CreatorSourceRegistry({
    env: { X_BEARER_TOKEN: 'secret' },
    now: () => NOW
  });
  const connector = {
    async collect() {
      if (current === 'success') return { account: {}, posts: [], nextCursor: null, exhausted: true };
      const error = new Error(current);
      error.status = current === 'auth' ? 401 : current === 'rate' ? 429 : 403;
      throw error;
    }
  };
  const success = await registry.execute('x-user-timeline', connector, account('x'));
  assert.equal(success.status, 'online');
  assert.equal(success.source.status, 'online');
  assert.equal(success.source.lastSuccessAt, NOW);

  current = 'rate';
  const limited = await registry.execute('x-user-timeline', connector, account('x'));
  assert.equal(limited.source.status, 'rate_limited');
  assert.equal(limited.source.lastSuccessAt, NOW);

  current = 'auth';
  assert.equal((await registry.execute('x-user-timeline', connector, account('x'))).source.status, 'auth_expired');
  current = 'permission';
  assert.equal((await registry.execute('x-user-timeline', connector, account('x'))).source.status, 'permission_missing');
});

test('source catalog exposes capability boundaries without credentials or false TikTok availability', () => {
  const catalog = buildCreatorSourceCatalog({
    X_BEARER_TOKEN: 'x-secret',
    INSTAGRAM_ACCESS_TOKEN: 'ig-secret',
    INSTAGRAM_BUSINESS_ACCOUNT_ID: 'viewer-id'
  });
  assert.equal(catalog.find((source) => source.id === 'x-user-timeline').configured, true);
  assert.equal(catalog.find((source) => source.id === 'reddit-user-submitted').status, 'unconfigured');
  const research = catalog.find((source) => source.id === 'tiktok-research-api');
  assert.equal(research.schedulable, false);
  assert.equal(research.status, 'eligibility_required');
  assert.equal(JSON.stringify(catalog).includes('x-secret'), false);
  assert.equal(JSON.stringify(catalog).includes('ig-secret'), false);
});

test('environment example documents every gated official creator credential without values', () => {
  const source = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  for (const name of [
    'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN',
    'X_BEARER_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
    'DOUYIN_ACCESS_TOKEN', 'DOUYIN_OPEN_ID'
  ]) {
    assert.match(source, new RegExp(`^${name}=$`, 'm'));
  }
});
