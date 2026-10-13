const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolRegistry } = require('../services/agent/tool-registry');
let reads = {}; let research = {};
try { reads = require('../services/agent/tools/read-tools'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
try { research = require('../services/ContentResearchService'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const SECRET = 'DO_NOT_EXPOSE_RAW_SECRET';
const now = Date.now();
const article = { id: 'n1', title: 'AI release', description: 'Public summary', url: 'https://example.com/story', source: 'Official', sourceGroup: 'product', publishedAt: new Date(now).toISOString(), rawPayload: SECRET, apiKey: SECRET, config: { token: SECRET } };
const signal = { ...article, summary: 'Public signal', sourceName: 'Official', sourceTrustClass: 'official', kind: 'model', metrics: { likes: 3, token: SECRET } };
const topic = { id: 't1', title: 'AI release', summary: 'Topic', trendScore: 20, creatorScore: 30, signals: [signal], opportunity: { angle: 'Public angle', rawPayload: SECRET }, evidence: [{ url: article.url, postId: 'p1', token: SECRET }], rawPayload: SECRET };
function fixture() {
  const calls = [];
  const record = (name, result) => (...args) => { calls.push({ name, args }); return result; };
  const newsService = { getLatestNews: record('news', { data: [article], total: 1 }), getAnalysisNews: record('analysis', { data: [article, { ...article, id: 'n2', source: 'Research', sourceGroup: 'research', url: 'https://example.org/paper' }] }), getAdminSources: record('health', [{ id: 's1', name: 'Public source', url: 'https://example.com/feed?token=' + SECRET, error_message: SECRET, config: SECRET }]) };
  const signalService = { listTopics: record('topics', [topic]), getTopic: record('topic', topic), listCreatorOpportunities: record('opportunities', [topic]), listChanges: record('changes', { items: [{ cursor: 2, topicId: 't1', changeType: 'updated', payload: { token: SECRET }, createdAt: article.publishedAt }], nextCursor: 2, oldestCursor: 1, latestCursor: 2, expired: false }) };
  const creatorStore = { queryPosts: record('posts', { items: [{ ...article, text: 'Public post', metrics: { likes: 3, raw: SECRET } }], nextCursor: null }), queryTopics: record('creatorTopics', { items: [topic], nextCursor: null }), listSourceCoverage: record('coverage', [{ id: 's1', platform: 'rss', status: 'online', accountCount: 1, lastFailureCode: SECRET, setupHint: SECRET, token: SECRET }]) };
  assert.equal(typeof reads.createReadTools, 'function');
  const declarations = reads.createReadTools({ newsService, signalService, creatorStore, sourceRegistry: { list: () => [] } });
  return { calls, registry: new ToolRegistry(declarations), newsService, signalService, creatorStore };
}
const scopes = ['news:read', 'signals:read', 'creators:read', 'content:read'];
const execute = (registry, name, args = {}) => registry.execute(name, args, { scopes });

test('initial catalog contains only bounded read tools with schemas and scopes', () => {
  const { registry } = fixture();
  assert.deepEqual(registry.list().map((tool) => tool.name).sort(), ['list_latest_news', 'search_news', 'list_hot_topics', 'get_topic_evidence', 'get_topic_changes', 'list_creator_opportunities', 'list_creator_posts', 'list_creator_topics', 'get_creator_source_coverage', 'get_source_health', 'build_content_brief'].sort());
  assert.ok(registry.list().every((tool) => tool.effect === 'read' && scopes.includes(tool.requiredScope) && tool.inputSchema && tool.outputSchema));
});

test('all tools directly call injected services and project nested secret/raw fields away', async () => {
  const { registry, calls } = fixture();
  for (const tool of registry.list()) {
    const args = tool.name === 'search_news' ? { q: 'AI' } : tool.name === 'get_topic_evidence' ? { id: 't1' } : {};
    const result = await execute(registry, tool.name, args);
    assert.equal(result.ok, true, `${tool.name}: ${JSON.stringify(result)}`);
    assert.equal(JSON.stringify(result).includes(SECRET), false, tool.name);
    assert.equal(JSON.stringify(result).includes('rawPayload'), false, tool.name);
  }
  assert.equal(calls.length, 11);
  assert.ok(calls.find((call) => call.name === 'news').args[0].signal instanceof AbortSignal);
  assert.ok(calls.find((call) => call.name === 'topic').args[1].signal instanceof AbortSignal);
  assert.equal(calls.find((call) => call.name === 'analysis').args[0], 500);
});

test('invalid queries, arbitrary URLs, unbounded limits and admin options fail before service access', async () => {
  const { registry, calls } = fixture();
  for (const [name, input] of [['search_news', { q: '' }], ['search_news', { q: 'a'.repeat(201) }], ['list_latest_news', { limit: 51 }], ['get_topic_evidence', { id: 't1', url: 'http://localhost' }], ['list_hot_topics', { windowHours: 9999 }], ['list_creator_posts', { raw: true }], ['build_content_brief', { days: 31 }]]) {
    assert.equal((await execute(registry, name, input)).error.code, 'invalid_input');
  }
  assert.equal(calls.length, 0);
});

test('unsafe evidence URLs are removed while public citations survive', async () => {
  const { registry, newsService } = fixture();
  newsService.getLatestNews = () => ({ data: ['http://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com/', 'https://service.internal/a', 'https://example.com/story?token=' + SECRET, article.url].map((url) => ({ ...article, url })), total: 9 });
  const result = await execute(registry, 'list_latest_news');
  assert.equal(result.ok, true);
  assert.equal(result.data.items.filter((item) => item.url).length, 2);
  assert.equal(result.data.items.at(-1).url, article.url);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test('bounded projections preserve evidence and cap oversized service collections', async () => {
  const { registry, newsService } = fixture();
  newsService.getLatestNews = () => ({ data: Array.from({ length: 100 }, () => article), total: 100 });
  const result = await execute(registry, 'list_latest_news', { limit: 2 });
  assert.equal(result.data.items.length, 2);
  const detail = await execute(registry, 'get_topic_evidence', { id: 't1' });
  assert.equal(detail.data.signals[0].url, article.url);
});

test('research extraction preserves query coercion, duplicate removal, missing topics and insufficient evidence', async () => {
  assert.equal(typeof research.ContentResearchService, 'function');
  const contentService = require('../services/ContentService');
  const calls = [];
  const service = new research.ContentResearchService({ newsService: { getAnalysisNews: async () => ({ data: [article] }) }, signalService: { getTopic: (id, options) => { calls.push(options); return id === 'missing' ? null : { signals: [signal, signal] }; } }, contentService, now: () => now });
  const missing = await service.buildBrief({ topicId: 'missing' });
  assert.deepEqual(missing, { statusCode: 404, body: { success: false, error: 'topic_not_found' } });
  const result = await service.buildBrief({ topicId: 't1', topic: 'AI', days: '999', limit: '999' });
  assert.equal(result.statusCode, 422); assert.equal(result.body.success, false);
  assert.equal(result.body.data.evidence.length, 1); assert.equal(calls.at(-1).windowHours, 720);
});

test('research tool has cited ready and insufficient results without copying prompts or internal failures', async () => {
  const { registry, newsService } = fixture();
  const ready = await execute(registry, 'build_content_brief', { topic: 'AI' });
  assert.equal(ready.data.status, 'ready'); assert.equal(ready.data.evidence.length, 2);
  assert.equal(ready.data.evidence[0].citationId, 'S1'); assert.equal(ready.data.prompt, undefined);
  newsService.getAnalysisNews = () => ({ data: [] });
  assert.equal((await execute(registry, 'build_content_brief')).data.status, 'insufficient_evidence');
  newsService.getAnalysisNews = () => { throw new Error(SECRET); };
  assert.equal((await execute(registry, 'build_content_brief')).error.code, 'tool_failed');
});

test('legacy Agent source projection shares safe public evidence fields', () => {
  const { AgentContextService } = require('../services/AgentContextService');
  const source = new AgentContextService().toSource({ ...article, url: 'https://example.com/story?token=' + SECRET }, 0);
  assert.equal(source.url, article.url); assert.equal(source.citationId, 'S1');
  assert.equal(JSON.stringify(source).includes(SECRET), false);
});

test('research cannot report ready after unsafe citations are discarded', async () => {
  const { registry, newsService } = fixture();
  newsService.getAnalysisNews = () => ({ data: [{ ...article, url: 'https://127.0.0.1/a' }, { ...article, id: 'n2', url: 'file:///secret' }] });
  const result = await execute(registry, 'build_content_brief');
  assert.equal(result.data.status, 'insufficient_evidence');
  assert.equal(result.data.evidence.length, 0);
});

test('legacy Agent retrieval excludes unsafe source links before assigning citation IDs', () => {
  const { AgentContextService } = require('../services/AgentContextService');
  const selected = new AgentContextService().selectEvidence('AI', [{ ...article, url: 'https://localhost/secret' }, { ...article, id: 'n2' }]);
  assert.equal(selected.length, 1); assert.equal(selected[0].id, 'n2');
});

test('research abort is forwarded and prevents remaining work after retrieval', async () => {
  const controller = new AbortController(); let options; let called = false;
  const service = new research.ContentResearchService({ newsService: { getAnalysisNews: async (_, context) => { options = context; controller.abort(); return { data: [] }; } }, contentService: { buildBriefFromArticles: () => { called = true; } } });
  await assert.rejects(service.buildBrief({}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(options.signal, controller.signal); assert.equal(called, false);
});

test('opportunities preserve public risk notes and never copy score raw inputs', async () => {
  const { registry, signalService } = fixture();
  signalService.listCreatorOpportunities = () => [{ ...topic, opportunity: { riskNotes: ['Public evidence is limited.'], rawInputs: { secret: SECRET }, angles: [{ audience: 'creator', title: 'A title', angle: 'Verify the original source.' }] } }];
  const result = await execute(registry, 'list_creator_opportunities');
  assert.deepEqual(result.data.items[0].opportunity.riskNotes, ['Public evidence is limited.']);
  assert.equal(result.data.items[0].opportunity.rawInputs, undefined);
});

test('public citations preserve supported destination identity while removing secrets and tracking', () => {
  const { publicUrl } = require('../services/agent/public-projections');
  const cases = [
    ['https://www.youtube.com/feeds/videos.xml?channel_id=UCXuqSBlHAE6Xw-yeJA0Tunw', { channel_id: 'UCXuqSBlHAE6Xw-yeJA0Tunw' }],
    ['https://s.weibo.com/weibo?q=%23AI%E6%96%B0%E9%97%BB%23', { q: '#AI新闻#' }],
    ['https://mp.weixin.qq.com/s?__biz=MzA3MDM0NTM3Mg%3D%3D&mid=2650012345&idx=1&sn=0123456789abcdef0123456789abcdef', { __biz: 'MzA3MDM0NTM3Mg==', mid: '2650012345', idx: '1', sn: '0123456789abcdef0123456789abcdef' }],
    ['https://www.toutiao.com/article?article_id=7412345678901234567', { article_id: '7412345678901234567' }],
    ['https://www.youtube.com/watch?v=dQw4w9WgXc', { v: 'dQw4w9WgXc' }]
  ];
  for (const [original, identity] of cases) {
    const result = publicUrl(`${original}&token=${SECRET}&auth=${SECRET}&key=${SECRET}&signature=${SECRET}&utm_source=${SECRET}&fbclid=${SECRET}`);
    assert.ok(result, original);
    assert.equal(new URL(result).origin + new URL(result).pathname, new URL(original).origin + new URL(original).pathname);
    assert.deepEqual(Object.fromEntries(new URL(result).searchParams), identity);
    assert.equal(result.includes(SECRET), false);
  }
});

test('public citation DNS names have valid bounded ASCII labels and reject reserved suffixes', () => {
  const { publicUrl } = require('../services/agent/public-projections');
  const tooLongHost = [63, 63, 63, 58].map(size => 'a'.repeat(size)).concat('com').join('.');
  for (const host of ['foo..bar', '-foo.com', 'foo-.com', '.example', 'under_score.com', 'foo.test', 'foo.example', 'foo.onion', 'localhost', 'foo.local', 'foo.internal', 'foo.lan', 'foo.home', 'foo.invalid', 'example.com..', 'example.com...', `${'a'.repeat(64)}.com`, tooLongHost]) {
    assert.equal(publicUrl(`https://${host}/a`), null, host);
  }
  const maxHost = [63, 63, 63, 57].map(size => 'a'.repeat(size)).concat('com').join('.');
  assert.equal(maxHost.length, 253);
  assert.equal(publicUrl(`https://${maxHost}/a`), `https://${maxHost}/a`);
  assert.equal(publicUrl('https://example.com./a'), 'https://example.com/a');
  assert.equal(publicUrl('https://例子.中国/a'), 'https://xn--fsqu00a.xn--fiqs8s/a');
  assert.equal(publicUrl('https://xn--fsqu00a.xn--fiqs8s/a'), 'https://xn--fsqu00a.xn--fiqs8s/a');
});

test('unsupported, malformed or ambiguous citation identity is rejected without changing its destination', () => {
  const { publicUrl } = require('../services/agent/public-projections');
  for (const value of [
    'https://example.com/story?document=123',
    'https://www.youtube.com/feeds/videos.xml?channel_id=bad%2Fchannel',
    'https://s.weibo.com/weibo?q=AI&q=robotics',
    'https://s.weibo.com/weibo?q=%00secret',
    'https://mp.weixin.qq.com/s?__biz=bad%3Chtml%3E&mid=1&idx=1&sn=bad',
    'https://example.com/article?article_id=',
    'https://example.com/article?article_id=a%2Fb',
    'https://example.com/article?keyword=AI',
    'https://example.com/weibo?q=AI'
  ]) assert.equal(publicUrl(value), null, value);
});

test('legacy Agent trend citations resolve URLs using the same sanitization as selected evidence', async (t) => {
  const NewsService = require('../services/NewsService');
  const TrendAnalyzer = require('../services/TrendAnalyzer');
  const { AgentContextService } = require('../services/AgentContextService');
  const originals = [NewsService.getAnalysisNews, NewsService.getStatistics, NewsService.getDiversityAnalysis, TrendAnalyzer.analyzeTrends];
  t.after(() => {
    [NewsService.getAnalysisNews, NewsService.getStatistics, NewsService.getDiversityAnalysis, TrendAnalyzer.analyzeTrends] = originals;
  });
  const url = `${article.url}?utm_source=feed`;
  NewsService.getAnalysisNews = async () => ({ data: [{ ...article, url }] });
  NewsService.getStatistics = async () => ({ total: 1, today: 1 });
  NewsService.getDiversityAnalysis = async () => ({});
  TrendAnalyzer.analyzeTrends = async () => ({ topKeywords: [{ keyword: 'AI', recentCount: 1, previousCount: 0, sources: [{ url }] }] });
  const result = await new AgentContextService().build('AI');
  assert.equal(result.sources[0].url, article.url);
  assert.deepEqual(result.trends[0]?.sourceIds, ['S1']);
});

test('research deduplicates final citation URLs before deciding evidence sufficiency', async () => {
  const { registry, newsService } = fixture();
  newsService.getAnalysisNews = () => ({ data: [
    { ...article, url: `${article.url}?utm_source=a` },
    { ...article, id: 'n2', source: 'Research mirror', sourceGroup: 'research', url: `${article.url}?utm_source=b` }
  ] });
  const result = await execute(registry, 'build_content_brief');
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'insufficient_evidence');
  assert.equal(result.data.evidence.length, 1);
  assert.equal(result.data.evidence[0].url, article.url);
  assert.equal(result.data.evidence[0].citationId, 'S1');
  assert.deepEqual(result.data.diversity, { evidenceTypes: 1, regions: 1, sources: 1 });
});

test('legacy Agent evidence uses one citation per final URL after query sanitization', () => {
  const { AgentContextService } = require('../services/AgentContextService');
  const service = new AgentContextService();
  const selected = service.selectEvidence('AI', [
    { ...article, url: `${article.url}?utm_source=a` },
    { ...article, id: 'n2', url: `${article.url}?utm_source=b` }
  ]);
  assert.equal(selected.length, 1);
  assert.equal(service.toSource(selected[0], 0).citationId, 'S1');
});

test('Signal and Creator nullable metric snapshots preserve unknown versus measured zero', async () => {
  const { registry, signalService, creatorStore } = fixture();
  const signalMetrics = require('../services/signals/signal-normalizer').normalizeMetrics({ views: null, likes: 0, comments: null, shares: null, stars: 12, forks: null, rank: null });
  const creatorMetrics = require('../services/creators/creator-normalizer').normalizeMetrics({ views: 1000, likes: 0, comments: 15, shares: null, bookmarks: null, platformRank: null, followersAtCapture: 10000 });
  signalService.getTopic = () => ({ ...topic, signals: [{ ...signal, metrics: signalMetrics }] });
  creatorStore.queryPosts = () => ({ items: [{ ...article, platform: 'youtube', metrics: { ...creatorMetrics, capturedAt: article.publishedAt } }] });
  const signalResult = await execute(registry, 'get_topic_evidence', { id: 't1' });
  const creatorResult = await execute(registry, 'list_creator_posts');
  assert.equal(signalResult.ok, true); assert.equal(creatorResult.ok, true);
  assert.equal(signalResult.data.signals[0].metrics.views, null);
  assert.equal(signalResult.data.signals[0].metrics.likes, 0);
  assert.equal(signalResult.data.signals[0].metrics.stars, 12);
  assert.equal(signalResult.data.signals[0].metrics.downloads, null);
  assert.equal(creatorResult.data.items[0].metrics.shares, null);
  assert.equal(creatorResult.data.items[0].metrics.likes, 0);
  assert.equal(creatorResult.data.items[0].metrics.views, 1000);
  assert.equal(creatorResult.data.items[0].metrics.stars, null);
  assert.equal(creatorResult.data.items[0].metrics.bookmarks, null);
  assert.equal(creatorResult.data.items[0].metrics.platformRank, null);
  assert.equal(creatorResult.data.items[0].metrics.followersAtCapture, 10000);
});
