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
  return { calls, registry: new ToolRegistry(declarations), newsService, signalService };
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
