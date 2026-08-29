const test = require('node:test');
const assert = require('node:assert/strict');

const YouTubeAdapter = require('../services/signals/adapters/youtube-adapter');
const XAdapter = require('../services/signals/adapters/x-adapter');
const NewsNowAdapter = require('../services/signals/adapters/newsnow-adapter');
const JsonBridgeAdapter = require('../services/signals/adapters/json-bridge-adapter');
const RssSignalAdapter = require('../services/signals/adapters/rss-signal-adapter');
const { buildSignalSourceCatalog } = require('../config/signalSources');
const { normalizeSignal } = require('../services/signals/signal-normalizer');

function fakeHttp(handler) {
  const calls = [];
  return {
    calls,
    async get(url, options) {
      calls.push({ url, options });
      return handler(url, options);
    }
  };
}

test('missing optional credentials return unconfigured without network calls', async () => {
  const http = fakeHttp(() => { throw new Error('network must not be called'); });
  const catalog = buildSignalSourceCatalog({});
  const youtube = catalog.find((source) => source.id === 'youtube-search');
  const x = catalog.find((source) => source.id === 'x-recent-search');
  const newsnow = catalog.find((source) => source.id === 'newsnow-weibo');

  assert.deepEqual(await new YouTubeAdapter({ http, env: {} }).collect(youtube), { status: 'unconfigured', items: [] });
  assert.deepEqual(await new XAdapter({ http, env: {} }).collect(x), { status: 'unconfigured', items: [] });
  assert.deepEqual(await new NewsNowAdapter({ http }).collect(newsnow), { status: 'unconfigured', items: [] });
  assert.equal(http.calls.length, 0);
});

test('YouTube adapter joins search results with real video statistics', async () => {
  const http = fakeHttp((url) => url.endsWith('/search') ? ({ data: { items: [{
    id: { videoId: 'video-1' },
    snippet: {
      title: 'AI Agent demo',
      description: 'A useful walkthrough',
      channelTitle: 'Creator Lab',
      publishedAt: '2026-08-27T00:00:00Z',
      tags: ['AI']
    }
  }] } }) : ({ data: { items: [{
    id: 'video-1',
    statistics: { viewCount: '1000', likeCount: '75', commentCount: '12' }
  }] } }));
  const adapter = new YouTubeAdapter({ http, env: { YOUTUBE_API_KEY: 'yt-secret' } });
  const result = await adapter.collect({
    id: 'youtube-search', configured: true, endpoint: 'https://www.googleapis.com/youtube/v3/search', timeoutMs: 10000
  }, { limit: 5 });

  assert.equal(result.items[0].url, 'https://www.youtube.com/watch?v=video-1');
  assert.deepEqual(result.items[0].metrics, { views: 1000, likes: 75, comments: 12 });
  assert.equal(http.calls.length, 2);
  assert.equal(http.calls[0].options.params.key, 'yt-secret');
  assert.equal(http.calls[1].options.params.id, 'video-1');
});

test('X adapter maps public metrics and keeps bearer token in request headers only', async () => {
  const http = fakeHttp(() => ({ data: {
    data: [{
      id: 'tweet-1',
      text: 'A new AI tool launched today',
      author_id: 'user-1',
      created_at: '2026-08-27T00:00:00Z',
      lang: 'en',
      public_metrics: {
        impression_count: 900,
        like_count: 45,
        reply_count: 8,
        repost_count: 12,
        quote_count: 3,
        bookmark_count: 6
      }
    }],
    includes: { users: [{ id: 'user-1', username: 'builder', name: 'Builder' }] }
  } }));
  const adapter = new XAdapter({ http, env: { X_BEARER_TOKEN: 'x-secret' } });
  const result = await adapter.collect({ configured: true, endpoint: 'https://api.x.com/2/tweets/search/recent', timeoutMs: 10000 }, { limit: 10 });

  assert.equal(result.items[0].url, 'https://x.com/builder/status/tweet-1');
  assert.deepEqual(result.items[0].metrics, { views: 900, likes: 45, replies: 8, reposts: 12, shares: 15 });
  assert.equal(http.calls[0].options.headers.Authorization, 'Bearer x-secret');
  assert.equal(JSON.stringify(result).includes('x-secret'), false);
});

test('NewsNow adapter maps allowlisted sources and drops unexpected evidence hosts', async () => {
  const http = fakeHttp(() => ({ data: {
    status: 'success',
    items: [
      { id: 'hot-1', title: 'AI 大模型进入热搜', url: 'https://weibo.com/ttarticle/p/show?id=1', mobileUrl: 'https://m.weibo.cn/detail/1', extra: { info: '123万' } },
      { id: 'hot-2', title: 'Poisoned link', url: 'https://evil.example/phishing' }
    ]
  } }));
  const adapter = new NewsNowAdapter({ http });
  const result = await adapter.collect({
    id: 'newsnow-weibo', configured: true, sourceId: 'weibo', endpoint: 'https://news.internal.example/api/s', timeoutMs: 10000
  }, { limit: 10 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, 'https://weibo.com/ttarticle/p/show?id=1');
  assert.equal(result.items[0].metrics.rank, 1);
  assert.equal(http.calls[0].options.params.id, 'weibo');
});

test('JSON bridge validates HTTPS configuration, response size, and item schema', async () => {
  const http = fakeHttp(() => ({ data: { signals: [
    { externalId: 'bridge-1', platform: 'xiaohongshu', region: 'cn', kind: 'social_post', title: 'AI 工具体验', url: 'https://www.xiaohongshu.com/explore/one', publishedAt: '2026-08-27T00:00:00Z', metrics: { likes: 20 } },
    { title: '', url: 'javascript:alert(1)' }
  ] } }));
  const adapter = new JsonBridgeAdapter({
    http,
    env: { SIGNAL_BRIDGES_JSON: JSON.stringify([{ id: 'creator-lab', url: 'https://bridge.example/signals' }]) }
  });
  const result = await adapter.collect({ id: 'custom-json-bridges', configured: true, timeoutMs: 12000 }, { limit: 10 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].platform, 'xiaohongshu');
  const normalized = normalizeSignal(result.items[0], {
    id: 'custom-json-bridges', name: 'Custom', platform: 'custom', region: 'global', trustClass: 'bridge'
  });
  assert.equal(normalized.platform, 'xiaohongshu');
  assert.equal(normalized.region, 'cn');
  assert.equal(http.calls[0].options.maxContentLength, 2 * 1024 * 1024);
  assert.match(http.calls[0].options.headers['User-Agent'], /AyaNews/);

  const unsafe = new JsonBridgeAdapter({
    http,
    env: { SIGNAL_BRIDGES_JSON: JSON.stringify([{ id: 'local', url: 'http://127.0.0.1:8080/signals' }]) }
  });
  assert.deepEqual(await unsafe.collect({ configured: false }), { status: 'unconfigured', items: [] });
});

test('RSSHub catalog joins only static allowlisted routes and remains a normal RSS fetch', async () => {
  const catalog = buildSignalSourceCatalog({ RSSHUB_BASE_URL: 'https://rss.internal.example/root/' });
  const weibo = catalog.find((source) => source.id === 'rsshub-weibo-hot');
  const parser = { parseString: async () => ({ items: [] }) };
  const http = fakeHttp(() => ({ data: '<rss />' }));

  assert.equal(weibo.endpoint, 'https://rss.internal.example/root/weibo/search/hot');
  await new RssSignalAdapter({ http, parser }).collect(weibo);
  assert.equal(http.calls[0].url, weibo.endpoint);
  assert.equal(catalog.some((source) => String(source.endpoint).includes('javascript:')), false);
});

test('L4 sidecars cannot be instantiated as scheduled adapters', () => {
  const catalog = buildSignalSourceCatalog({});
  for (const id of ['mediacrawler-sidecar', 'agent-reach-sidecar']) {
    const source = catalog.find((item) => item.id === id);
    assert.equal(source.schedulable, false);
    assert.equal(source.configured, false);
    assert.equal(source.enabled, false);
  }
});
