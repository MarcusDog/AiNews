const { object, text, count, list } = require('../tool-schemas');
const { project, schemas } = require('../public-projections');
const { ContentResearchService } = require('../../ContentResearchService');
const { buildSourceHealthSnapshot } = require('../../../utils/source-health');

const limit = { type: 'integer', minimum: 1, maximum: 50 };
const query = { ...text(200), minLength: 1 };
const windowHours = { type: 'integer', minimum: 24, maximum: 72, enum: [24, 48, 72] };
const itemsSchema = (schema, extra = {}) => object({ items: list(schema), ...extra });
const nullableCount = { ...count(), type: ['integer', 'null'] };

// All dependencies are existing services/stores, never routers, HTTP or SQL. A
// missing dependency fails through the registry's generic error contract.
function createReadTools(dependencies = {}) {
  const { newsService, signalService, creatorStore, sourceRegistry } = dependencies;
  const research = dependencies.researchService || new ContentResearchService(dependencies);
  const declare = (name, description, requiredScope, properties, required, outputSchema, execute) => ({
    name, version: '1.0.0', description, effect: 'read', requiredScope,
    inputSchema: object(properties, required), outputSchema, timeoutMs: 5000, maxOutputBytes: 131072, execute
  });
  const items = (schema, values, max = 20) => (Array.isArray(values) ? values : []).slice(0, max).map((value) => project(schema, value));
  const topicOptions = (args, signal) => ({ windowHours: args.windowHours || 72, limit: args.limit || 20, offset: 0, signal });
  const latest = async (args, { signal }) => {
    const result = await newsService.getLatestNews({ page: 1, limit: args.limit || 20, category: args.category, search: args.q, signal });
    return { items: items(schemas.news, result.data, args.limit || 20), total: project(count(), result.total) };
  };
  return [
    declare('list_latest_news', 'Read the latest public News evidence.', 'news:read', { limit, category: text(80) }, [], itemsSchema(schemas.news, { total: count() }), latest),
    declare('search_news', 'Search public News by a bounded query.', 'news:read', { q: query, limit, category: text(80) }, ['q'], itemsSchema(schemas.news, { total: count() }), latest),
    declare('list_hot_topics', 'List Signal topics for a bounded time window.', 'signals:read', { limit, windowHours }, [], itemsSchema(schemas.topic), async (args, { signal }) => ({ items: items(schemas.topic, await signalService.listTopics(topicOptions(args, signal)), args.limit || 20) })),
    declare('get_topic_evidence', 'Read a Signal topic with cited public evidence.', 'signals:read', { id: { ...text(120), minLength: 1 }, windowHours }, ['id'], { ...schemas.topic, type: ['object', 'null'] }, async (args, { signal }) => {
      const topic = await signalService.getTopic(args.id, { windowHours: args.windowHours || 72, signal });
      return topic ? project(schemas.topic, topic) : null;
    }),
    declare('get_topic_changes', 'Read change metadata without raw event payloads.', 'signals:read', { since: count(), limit }, [], itemsSchema(schemas.change, { expired: { type: 'boolean' }, nextCursor: nullableCount, oldestCursor: nullableCount, latestCursor: nullableCount }), async (args, { signal }) => {
      const result = await signalService.listChanges({ cursor: args.since || 0, limit: args.limit || 20, signal });
      const cursor = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
      return { items: items(schemas.change, result.items, args.limit || 20), expired: result.expired === true, nextCursor: cursor(result.nextCursor), oldestCursor: cursor(result.oldestCursor), latestCursor: cursor(result.latestCursor) };
    }),
    declare('list_creator_opportunities', 'Read evidence-backed Signal content opportunities.', 'signals:read', { limit, windowHours, profile: { ...text(30), enum: ['general', 'short-video', 'tool-review', 'news-commentary', 'deep-dive'] } }, [], itemsSchema(schemas.topic), async (args, { signal }) => ({ items: items(schemas.topic, await signalService.listCreatorOpportunities({ ...topicOptions(args, signal), profile: args.profile || 'general' }), args.limit || 20) })),
    declare('list_creator_posts', 'Read public Creator posts and evidence URLs.', 'creators:read', { limit, q: query, creator: text(120), vertical: text(80), platform: text(40) }, [], itemsSchema(schemas.post), async (args, { signal }) => {
      const result = await creatorStore.queryPosts({ ...args, limit: args.limit || 20, signal });
      return { items: items(schemas.post, result.items, args.limit || 20) };
    }),
    declare('list_creator_topics', 'Read Creator topics with public source evidence.', 'creators:read', { limit, q: query, vertical: text(80), windowHours }, [], itemsSchema(schemas.creatorTopic), async (args, { signal }) => {
      const now = dependencies.now ? Number(new Date(dependencies.now())) : Date.now();
      const { windowHours: hours = 72, ...filters } = args;
      const result = await creatorStore.queryTopics({ ...filters, limit: args.limit || 20, since: new Date(now - hours * 3600000).toISOString(), signal });
      return { items: items(schemas.creatorTopic, result.items, args.limit || 20) };
    }),
    declare('get_creator_source_coverage', 'Read Creator source coverage without setup or error details.', 'creators:read', { limit }, [], itemsSchema(schemas.coverage), async (args, { signal }) => ({ items: items(schemas.coverage, await creatorStore.listSourceCoverage(sourceRegistry?.list?.() || [], { signal }), args.limit || 20) })),
    declare('get_source_health', 'Read public News source health counters.', 'news:read', { limit }, [], itemsSchema(schemas.source), async (args, { signal }) => {
      const snapshot = buildSourceHealthSnapshot(await newsService.getAdminSources({ signal }));
      return { items: items(schemas.source, snapshot.sources, args.limit || 20) };
    }),
    declare('build_content_brief', 'Build a cited research brief; insufficient evidence remains explicit.', 'content:read', { topic: text(120), topicId: text(120), audience: text(120), goal: text(180), format: { ...text(30), enum: ['article', 'short-video', 'newsletter', 'xiaohongshu'] }, days: { type: 'integer', minimum: 1, maximum: 30 }, limit: { type: 'integer', minimum: 3, maximum: 8 } }, [], schemas.brief, async (args, context) => {
      const result = await research.buildBrief(args, context);
      const brief = project(schemas.brief, result.body.data || { status: 'not_found' });
      brief.evidence = brief.evidence.filter((item) => item.url);
      brief.diversity = {
        sources: new Set(brief.evidence.map((item) => item.source)).size,
        regions: new Set(brief.evidence.map((item) => item.region)).size,
        evidenceTypes: new Set(brief.evidence.map((item) => item.evidenceType)).size
      };
      if (brief.status === 'ready' && brief.evidence.length < 2) {
        brief.status = 'insufficient_evidence';
        brief.notice = '没有足够的公开来源支持可靠回答。';
      }
      return brief;
    })
  ];
}
module.exports = { createReadTools };
