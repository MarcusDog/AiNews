const test = require('node:test');
const assert = require('node:assert/strict');

const HackerNewsAdapter = require('../services/signals/adapters/hacker-news-adapter');
const GitHubAdapter = require('../services/signals/adapters/github-adapter');
const MastodonAdapter = require('../services/signals/adapters/mastodon-adapter');
const HuggingFaceAdapter = require('../services/signals/adapters/hugging-face-adapter');
const BilibiliAdapter = require('../services/signals/adapters/bilibili-adapter');
const RssSignalAdapter = require('../services/signals/adapters/rss-signal-adapter');
const LegacyNewsAdapter = require('../services/signals/adapters/legacy-news-adapter');

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

test('Hacker News adapter maps story engagement and uses bounded dated search', async () => {
  const http = fakeHttp(() => ({
    data: {
      hits: [{
        objectID: '123',
        title: 'Show HN: An AI coding tool',
        url: null,
        author: 'maker',
        created_at: '2026-08-27T00:00:00.000Z',
        points: 42,
        num_comments: 11,
        _tags: ['story', 'show_hn']
      }]
    }
  }));
  const adapter = new HackerNewsAdapter({ http });
  const items = await adapter.collect({
    id: 'hackernews-ai', endpoint: 'https://hn.algolia.com/api/v1/search_by_date', timeoutMs: 9000
  }, { limit: 10, now: new Date('2026-08-27T02:00:00.000Z') });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://news.ycombinator.com/item?id=123');
  assert.deepEqual(items[0].metrics, { points: 42, comments: 11 });
  assert.equal(http.calls[0].options.timeout, 9000);
  assert.equal(http.calls[0].options.params.tags, 'story');
  assert(http.calls[0].options.params.numericFilters.includes('created_at_i>'));
  assert.match(http.calls[0].options.headers['User-Agent'], /AyaNews/);
});

test('GitHub adapter maps real repository metrics and optional rate-limit metadata', async () => {
  const http = fakeHttp(() => ({
    headers: { 'x-ratelimit-remaining': '27', 'x-ratelimit-reset': '1787790000' },
    data: {
      items: [{
        id: 88,
        full_name: 'example/creator-ai',
        html_url: 'https://github.com/example/creator-ai',
        description: 'Creator intelligence toolkit',
        owner: { login: 'example' },
        created_at: '2026-08-26T00:00:00Z',
        pushed_at: '2026-08-27T01:00:00Z',
        stargazers_count: 350,
        forks_count: 31,
        open_issues_count: 7,
        language: 'TypeScript',
        topics: ['artificial-intelligence', 'creator-tools']
      }]
    }
  }));
  const adapter = new GitHubAdapter({ http, env: { GITHUB_TOKEN: 'token-value' } });
  const result = await adapter.collect({
    id: 'github-recent-ai', endpoint: 'https://api.github.com/search/repositories', timeoutMs: 10000
  }, { limit: 5, now: new Date('2026-08-27T02:00:00Z') });

  assert.equal(result.items[0].repoFullName, 'example/creator-ai');
  assert.deepEqual(result.items[0].metrics, { stars: 350, forks: 31, openIssues: 7 });
  assert.equal(result.rateLimit.remaining, 27);
  assert.equal(http.calls[0].options.headers.Authorization, 'Bearer token-value');
  assert.match(http.calls[0].options.params.q, /created:>=/);
});

test('Mastodon adapter keeps only AI-relevant public trends and returned metrics', async () => {
  const http = fakeHttp((url) => url.endsWith('/statuses') ? ({ data: [{
    id: 'status-1',
    created_at: '2026-08-27T00:00:00Z',
    content: '<p>New <strong>AI agent</strong> benchmark</p>',
    url: 'https://mastodon.social/@researcher/1',
    account: { acct: 'researcher' },
    favourites_count: 9,
    reblogs_count: 4,
    replies_count: 2,
    tags: [{ name: 'AI' }]
  }, {
    id: 'status-weather', created_at: '2026-08-27T00:00:00Z',
    content: '<p>A quiet morning beside the lake</p>', url: 'https://mastodon.social/@photo/2',
    account: { acct: 'photo' }, favourites_count: 90, reblogs_count: 20, replies_count: 3, tags: []
  }] }) : ({ data: [{
    url: 'https://example.org/ai-launch',
    title: 'AI launch',
    description: 'A launch shared on Mastodon',
    author_name: 'Example',
    history: [{ day: '1787788800', uses: '17', accounts: '12' }]
  }, {
    url: 'https://example.org/travel', title: 'Summer travel guide',
    description: 'Places to visit', author_name: 'Travel', history: [{ day: '1787788800', uses: '100' }]
  }] }));
  const adapter = new MastodonAdapter({ http });
  const items = await adapter.collect({
    endpoint: 'https://mastodon.social/api/v1/trends', timeoutMs: 12000
  }, { limit: 10 });

  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'New AI agent benchmark');
  assert.deepEqual(items[0].metrics, { likes: 9, reposts: 4, replies: 2 });
  assert.deepEqual(items[1].metrics, { shares: 17 });
  assert.equal(http.calls.length, 2);
});

test('Mastodon adapter keeps usable AI statuses when the trending links endpoint fails', async () => {
  const http = fakeHttp((url) => {
    if (url.endsWith('/links')) throw new Error('links endpoint unavailable');
    return { data: [{
      id: 'status-2',
      created_at: '2026-08-27T00:00:00Z',
      content: '<p>Claude released a new AI coding workflow</p>',
      url: 'https://mastodon.social/@builder/2',
      account: { acct: 'builder' },
      favourites_count: 12,
      reblogs_count: 5,
      replies_count: 3,
      tags: [{ name: 'AI' }]
    }] };
  });
  const adapter = new MastodonAdapter({ http });
  const items = await adapter.collect({
    endpoint: 'https://mastodon.social/api/v1/trends', timeoutMs: 12000
  }, { limit: 10 });

  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, 'status-2');
});

test('Hugging Face adapter maps model, dataset and space repository URLs', async () => {
  const http = fakeHttp(() => ({ data: { recentlyTrending: [
    { repoType: 'model', repoData: { id: 'Qwen/Test', author: 'Qwen', lastModified: '2026-08-27T00:00:00Z', likes: 30, downloads: 200, pipeline_tag: 'text-generation' } },
    { repoType: 'dataset', repoData: { id: 'org/data', author: 'org', lastModified: '2026-08-26T00:00:00Z', likes: 4, downloads: 20 } },
    { repoType: 'space', repoData: { id: 'org/demo', author: 'org', lastModified: '2026-08-25T00:00:00Z', likes: 15 } }
  ] } }));
  const adapter = new HuggingFaceAdapter({ http });
  const items = await adapter.collect({ endpoint: 'https://huggingface.co/api/trending', timeoutMs: 10000 }, { limit: 40 });

  assert.deepEqual(items.map((item) => item.url), [
    'https://huggingface.co/Qwen/Test',
    'https://huggingface.co/datasets/org/data',
    'https://huggingface.co/spaces/org/demo'
  ]);
  assert.deepEqual(items[0].metrics, { likes: 30, downloads: 200 });
  assert.equal(http.calls[0].options.params.limit, 20);
});

test('Bilibili adapter applies deterministic AI relevance policy before mapping metrics', async () => {
  const http = fakeHttp(() => ({ data: { code: 0, data: { list: [
    {
      aid: 1, bvid: 'BVAI001', title: 'DeepSeek 新模型实测', desc: '大模型推理效果对比', pubdate: 1787788800,
      owner: { name: '科技频道' }, stat: { view: 1000, like: 80, reply: 12, share: 5, favorite: 20, coin: 7 }
    },
    {
      aid: 2, bvid: 'BVNO002', title: '手办模型智能收纳', desc: '本周居家整理', pubdate: 1787788800,
      owner: { name: '生活频道' }, stat: { view: 9000, like: 800, reply: 100, share: 20 }
    }
  ] } } }));
  const adapter = new BilibiliAdapter({ http });
  const items = await adapter.collect({ endpoint: 'https://api.bilibili.com/x/web-interface/popular', timeoutMs: 10000 }, { limit: 20 });

  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, 'BVAI001');
  assert.deepEqual(items[0].metrics, {
    views: 1000, likes: 80, comments: 12, shares: 5
  });
  assert.equal('favorites' in items[0].metrics, false);
  assert.match(http.calls[0].options.headers.Referer, /bilibili/);
});

test('RSS adapter maps Reddit Atom without inventing engagement', async () => {
  const http = fakeHttp(() => ({ data: '<feed />' }));
  const parser = { parseString: async () => ({ items: [{
    guid: 'reddit-1',
    title: 'Local model release discussion',
    link: 'https://www.reddit.com/r/LocalLLaMA/comments/one',
    creator: 'u/member',
    isoDate: '2026-08-27T00:00:00Z',
    contentSnippet: 'Community discussion'
  }] }) };
  const adapter = new RssSignalAdapter({ http, parser });
  const items = await adapter.collect({
    id: 'reddit-localllama', endpoint: 'https://www.reddit.com/r/LocalLLaMA/.rss', platform: 'reddit', timeoutMs: 10000
  }, { limit: 10 });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0].metrics, {});
  assert.equal(items[0].kind, 'discussion');
  assert.match(http.calls[0].options.headers['User-Agent'], /AyaNews/);
});

test('RSS adapter shares one Reddit aggregate request and filters each configured community', async () => {
  const http = fakeHttp(() => ({ data: '<feed />' }));
  const parser = { parseString: async () => ({ items: [{
    guid: 'local-1', title: 'New local AI model',
    link: 'https://www.reddit.com/r/LocalLLaMA/comments/local', isoDate: '2026-08-27T00:00:00Z'
  }, {
    guid: 'ml-1', title: 'Machine learning research discussion',
    link: 'https://www.reddit.com/r/MachineLearning/comments/ml', isoDate: '2026-08-27T00:00:00Z'
  }] }) };
  const adapter = new RssSignalAdapter({ http, parser });
  const shared = 'https://www.reddit.com/r/LocalLLaMA+MachineLearning+artificial/.rss?limit=75';

  const [local, machineLearning] = await Promise.all([
    adapter.collect({ endpoint: shared, platform: 'reddit', community: 'LocalLLaMA', timeoutMs: 10000 }),
    adapter.collect({ endpoint: shared, platform: 'reddit', community: 'MachineLearning', timeoutMs: 10000 })
  ]);

  assert.equal(http.calls.length, 1);
  assert.deepEqual(local.map((item) => item.externalId), ['local-1']);
  assert.deepEqual(machineLearning.map((item) => item.externalId), ['ml-1']);
});

test('RSS adapter excludes generic philosophy posts from broad Reddit AI communities', async () => {
  const http = fakeHttp(() => ({ data: '<feed />' }));
  const parser = { parseString: async () => ({ items: [{
    guid: 'generic-1', title: 'What enables consciousness?',
    link: 'https://www.reddit.com/r/artificial/comments/generic',
    contentSnippet: 'A broad philosophical question about human experience.',
    isoDate: '2026-08-27T00:00:00Z'
  }, {
    guid: 'ai-1', title: 'New Claude memory feature changes agent workflows',
    link: 'https://www.reddit.com/r/artificial/comments/ai',
    contentSnippet: 'Users compare the AI assistant feature with ChatGPT memory.',
    isoDate: '2026-08-27T00:00:00Z'
  }] }) };
  const adapter = new RssSignalAdapter({ http, parser });
  const items = await adapter.collect({
    endpoint: 'https://www.reddit.com/r/artificial/.rss',
    platform: 'reddit', community: 'artificial', timeoutMs: 10000
  });

  assert.deepEqual(items.map((item) => item.externalId), ['ai-1']);
});

test('legacy News adapter imports real database rows as compatibility signals', async () => {
  const adapter = new LegacyNewsAdapter({ newsProvider: async () => ({ data: [{
    id: 'news-1',
    title: 'Official model announcement',
    description: 'Release details',
    url: 'https://official.example/news/model',
    source: 'Official Lab',
    category: 'AI新闻',
    region: 'cn',
    language: 'zh',
    publishedAt: '2026-08-27T00:00:00Z',
    author: 'Lab'
  }] }) });
  const items = await adapter.collect({ id: 'legacy-news', platform: 'news' }, { limit: 20 });

  assert.equal(items[0].externalId, 'news-1');
  assert.equal(items[0].kind, 'news');
  assert.equal(items[0].region, 'cn');
  assert.equal(items[0].language, 'zh');
  assert.deepEqual(items[0].metrics, {});
  assert.deepEqual(items[0].tags, ['AI新闻', 'Official Lab']);
});
