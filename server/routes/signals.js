const express = require('express');
const { isAdminKeyValid } = require('../middleware/adminAuth');

const METRIC_FIELDS = [
  'views', 'likes', 'comments', 'replies', 'shares', 'reposts',
  'stars', 'forks', 'openIssues', 'points', 'rank', 'downloads'
];
const WINDOWS = new Map([['24h', 24], ['48h', 48], ['72h', 72]]);

function integerQuery(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function queryOptions(req) {
  const window = req.query.window || '72h';
  const windowHours = WINDOWS.get(window);
  const page = integerQuery(req.query.page, 1, 1, 100000);
  const limit = integerQuery(req.query.limit, 20, 1, 100);
  if (!windowHours || page === null || limit === null) return null;
  return { window, windowHours, page, limit, offset: (page - 1) * limit };
}

function publicMetrics(metrics = {}) {
  return Object.fromEntries(METRIC_FIELDS.map((field) => [field, metrics[field] ?? null]));
}

function publicSignal(signal = {}) {
  return {
    id: signal.id,
    sourceId: signal.sourceId,
    sourceName: signal.sourceName,
    sourceTrustClass: signal.sourceTrustClass,
    platform: signal.platform,
    region: signal.region,
    kind: signal.kind,
    title: signal.title,
    summary: signal.summary,
    url: signal.url,
    canonicalUrl: signal.canonicalUrl,
    author: signal.author,
    language: signal.language,
    publishedAt: signal.publishedAt,
    metrics: publicMetrics(signal.metrics),
    tags: signal.tags || [],
    repoFullName: signal.repoFullName || null
  };
}

function publicTopic(topic = {}, includeSignals = false) {
  return {
    id: topic.id,
    canonical_topic_id: topic.canonicalTopicId || topic.id,
    anchor: topic.anchor,
    title: topic.title,
    summary: topic.summary,
    firstSeenAt: topic.firstSeenAt,
    latestSeenAt: topic.latestSeenAt,
    trendScore: topic.trendScore,
    creatorScore: topic.creatorScore,
    trendDirection: topic.trendDirection,
    evidenceStrength: topic.evidenceStrength,
    formulaVersion: topic.formulaVersion,
    scoreBreakdown: topic.scoreBreakdown,
    opportunity: topic.opportunity,
    clusterReasons: topic.clusterReasons || [],
    evidenceCount: topic.evidenceCount || 0,
    ...(includeSignals ? { signals: (topic.signals || []).map(publicSignal) } : {})
  };
}

function opportunityItem(topic) {
  return {
    topic_id: topic.id,
    title: topic.title,
    summary: topic.summary,
    trend_score: topic.trendScore,
    creator_score: topic.creatorScore,
    trend_direction: topic.trendDirection,
    evidence_strength: topic.evidenceStrength,
    latest_seen_at: topic.latestSeenAt,
    opportunity: topic.opportunity
  };
}

function createSignalsRouter(options = {}) {
  if (!options.service) throw new TypeError('Signals router requires a service');
  const router = express.Router();
  const service = options.service;
  const random = options.random || Math.random;
  const configuredAdminKey = options.adminKey === undefined ? process.env.ADMIN_API_KEY : options.adminKey;

  router.get('/topics', (req, res, next) => {
    try {
      const query = queryOptions(req);
      if (!query) return res.status(400).json({ success: false, error: 'invalid_query' });
      const items = service.listTopics({ windowHours: query.windowHours, limit: query.limit, offset: query.offset });
      return res.json({
        success: true,
        data: { items: items.map((item) => publicTopic(item)) },
        meta: { window: query.window, page: query.page, limit: query.limit, count: items.length }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/topics/:id', (req, res, next) => {
    try {
      const item = service.getTopic(req.params.id);
      if (!item) return res.status(404).json({ success: false, error: 'topic_not_found' });
      return res.json({ success: true, data: publicTopic(item, true) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/opportunities', (req, res, next) => {
    try {
      const query = queryOptions(req);
      if (!query) return res.status(400).json({ success: false, error: 'invalid_query' });
      const topics = service.listTopics({ windowHours: query.windowHours, limit: query.limit, offset: query.offset });
      const items = [...topics].sort((a, b) => b.creatorScore - a.creatorScore || b.trendScore - a.trendScore || a.id.localeCompare(b.id));
      return res.json({
        success: true,
        data: { items: items.map(opportunityItem) },
        meta: { window: query.window, page: query.page, limit: query.limit, count: items.length }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/opportunities/random', (req, res, next) => {
    try {
      const query = queryOptions(req);
      if (!query) return res.status(400).json({ success: false, error: 'invalid_query' });
      const topics = service.listTopics({ windowHours: query.windowHours, limit: 100, offset: 0 });
      if (!topics.length) return res.status(404).json({ success: false, error: 'no_opportunity_available' });
      const index = Math.min(topics.length - 1, Math.max(0, Math.floor(random() * topics.length)));
      return res.json({ success: true, data: opportunityItem(topics[index]), meta: { window: query.window } });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/sources', (req, res, next) => {
    try {
      const items = service.listSources();
      return res.json({ success: true, data: { items }, meta: { count: items.length } });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/changes', (req, res, next) => {
    try {
      const since = integerQuery(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
      const limit = integerQuery(req.query.limit, 100, 1, 500);
      if (since === null || limit === null) return res.status(400).json({ success: false, error: 'invalid_query' });
      const result = service.listChanges({ cursor: since, limit });
      if (result.expired) {
        return res.status(410).json({
          success: false,
          error: 'cursor_expired',
          resync: '/api/signals/v1/topics',
          oldest_cursor: result.oldestCursor,
          latest_cursor: result.latestCursor
        });
      }
      return res.json({
        success: true,
        data: { items: result.items },
        meta: {
          since,
          next_cursor: result.nextCursor,
          oldest_cursor: result.oldestCursor,
          latest_cursor: result.latestCursor
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/health', (req, res, next) => {
    try {
      const sources = service.listSources();
      const statuses = ['online', 'degraded', 'offline', 'unconfigured', 'disabled', 'pending'];
      const summary = { total: sources.length };
      statuses.forEach((status) => { summary[status] = sources.filter((source) => source.status === status).length; });
      return res.json({ success: true, data: { status: summary.offline ? 'degraded' : 'ok', summary } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/admin/refresh', async (req, res, next) => {
    try {
      if (!configuredAdminKey) return res.status(503).json({ success: false, error: 'admin_not_configured' });
      const provided = req.get('x-admin-api-key');
      if (!provided) return res.status(401).json({ success: false, error: 'admin_key_required' });
      if (!isAdminKeyValid(configuredAdminKey, provided)) {
        return res.status(403).json({ success: false, error: 'admin_key_invalid' });
      }
      const itemLimit = integerQuery(req.body?.itemLimit, undefined, 1, 500);
      const sourceLimit = integerQuery(req.body?.sourceLimit, undefined, 1, 100);
      if (itemLimit === null || sourceLimit === null) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = await service.refreshAll({
        refreshLegacy: req.body?.refreshLegacy === true,
        itemLimit,
        sourceLimit
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(500).json({ success: false, error: 'signal_service_error' });
  });
  return router;
}

module.exports = {
  METRIC_FIELDS,
  createSignalsRouter,
  publicSignal,
  publicTopic
};
