/**
 * Creators v1 Router
 *
 * Exposes read-only Creator Intelligence endpoints backed by CreatorStore.
 * Writes (subscriptions, delivery endpoints, signed ingest, admin refresh)
 * stay on the authenticated / admin API surface and are intentionally not
 * mounted here per the Skill contract.
 */

const express = require('express');
const CreatorStore = require('../services/creators/creator-store');

const WINDOWS = new Map([
  ['24h', 24],
  ['48h', 48],
  ['72h', 72]
]);

const HOT_TYPES = new Set(['post', 'multi_creator', 'cross_platform']);

const STATUSES = new Set(['verified', 'candidate', 'rejected']);

function integerQuery(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function boolQuery(value) {
  if (value === undefined) return undefined;
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function resolveWindow(value) {
  const key = value || '72h';
  const hours = WINDOWS.get(key);
  return hours ? { key, hours } : null;
}

function passCursor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  return raw;
}

function publicCreator(creator = {}) {
  return {
    id: creator.id,
    displayName: creator.displayName || creator.display_name || null,
    kind: creator.kind || null,
    reviewStatus: creator.reviewStatus || creator.review_status || null,
    reviewedAt: creator.reviewedAt || creator.reviewed_at || null,
    verticalIds: creator.verticalIds || creator.vertical_ids || [],
    accountCount: creator.accountCount ?? creator.account_count ?? null,
    latestPostAt: creator.latestPostAt || creator.latest_post_at || null
  };
}

function publicPost(post = {}) {
  return {
    id: post.id,
    creatorId: post.creatorId || post.creator_id || null,
    creatorName: post.creatorName || post.creator_name || null,
    accountId: post.accountId || post.account_id || null,
    platform: post.platform || null,
    externalPostId: post.externalPostId || post.external_post_id || null,
    url: post.url || null,
    title: post.title || null,
    text: post.text || null,
    summary: post.summary || null,
    language: post.language || null,
    region: post.region || null,
    publishedAt: post.publishedAt || post.published_at || null,
    collectedAt: post.collectedAt || post.collected_at || null,
    verticalIds: post.verticalIds || post.vertical_ids || [],
    verticals: post.verticals || [],
    metrics: post.metrics || {},
    hotness: post.hotness || null,
    evidenceState: post.evidenceState || post.evidence_state || null
  };
}

function publicTopic(topic = {}) {
  const evidence = Array.isArray(topic.evidence) ? topic.evidence.map((item) => ({
    postId: item.postId || item.post_id || null,
    url: item.url || null
  })).filter((item) => item.url) : [];
  return {
    id: topic.id,
    title: topic.title || null,
    summary: topic.summary || null,
    vertical: topic.vertical || topic.verticalId || topic.vertical_id || null,
    verticalId: topic.verticalId || topic.vertical_id || null,
    firstSeenAt: topic.firstSeenAt || topic.first_seen_at || null,
    latestSeenAt: topic.latestSeenAt || topic.latest_seen_at || null,
    postCount: topic.postCount ?? topic.post_count ?? (evidence.length || null),
    creatorCount: topic.creatorCount ?? topic.creator_count ?? null,
    platformCount: topic.platformCount ?? topic.platform_count ?? null,
    platforms: topic.platforms || [],
    hotness: topic.hotness ?? null,
    formulaVersion: topic.formulaVersion || topic.formula_version || null,
    evidenceState: topic.evidenceState || topic.evidence_state || null,
    evidence
  };
}

function publicSourceCoverage(source = {}) {
  return {
    id: source.id,
    platform: source.platform || null,
    support: source.support || null,
    configured: source.configured === true,
    schedulable: source.schedulable === true,
    status: source.status || null,
    latestSuccess: source.latestSuccess || source.latest_success || null,
    lastFailure: source.lastFailure || source.last_failure || null,
    accountCount: source.accountCount ?? source.account_count ?? 0,
    postCount: source.postCount ?? source.post_count ?? 0,
    coverage: source.coverage || null,
    reason: source.reason || null
  };
}

function publicChange(change = {}) {
  const entityType = change.entityType || change.entity_type || null;
  const entityId = change.entityId || change.entity_id || null;
  return {
    seq: change.seq,
    id: change.id || null,
    eventType: change.eventType || change.event_type || null,
    entityType,
    entityId,
    verticalId: change.verticalId || change.vertical_id || null,
    platform: change.platform || null,
    score: typeof change.score === 'number' ? change.score : (change.score == null ? null : Number(change.score) || null),
    formulaVersion: change.formulaVersion || change.formula_version || null,
    occurredAt: change.occurredAt || change.occurred_at || null,
    payload: change.payload || {}
  };
}

function createCreatorsRouter(options = {}) {
  const store = options.store instanceof CreatorStore
    ? options.store
    : new CreatorStore(options.storeOptions || {});

  // Enrich helpers: take store rows and join display_name + creator_id
  // for posts, and creatorCount + platformCount + real evidence for
  // topics, so that <CreatorDashboard /> in the SPA can render without
  // guessing. Each helper issues a small SQL on the same store.db
  // (better-sqlite3 WAL allows many concurrent readers).
  const enrichPost = (post) => {
    if (!post || !post.id) return post;
    if (!post.creatorId) {
      const row = store.db.prepare(`
        SELECT a.creator_id, c.display_name AS creator_name
        FROM creator_accounts a
        JOIN creators c ON c.id = a.creator_id
        WHERE a.id = ?
      `).get(post.accountId || post.account_id || null);
      if (row) {
        post.creatorId = row.creator_id;
        post.creatorName = row.creator_name;
      }
    }
    return post;
  };

  const enrichTopic = (topic) => {
    if (!topic || !topic.id) return topic;
    // Real evidence from creator_topic_posts join creator_posts url
    const evidence = store.db.prepare(`
      SELECT tp.post_id, p.url
      FROM creator_topic_posts tp
      JOIN creator_posts p ON p.id = tp.post_id
      WHERE tp.topic_id = ?
      ORDER BY tp.adopted_at DESC
      LIMIT 12
    `).all(topic.id).filter((row) => row.url).map((row) => ({ postId: row.post_id, url: row.url }));
    if (evidence.length) topic.evidence = evidence;
    // creatorCount + platformCount recompute if missing/zero
    if (!topic.creatorCount || !topic.platformCount) {
      const stats = store.db.prepare(`
        SELECT COUNT(DISTINCT a.creator_id) AS creator_count,
               COUNT(DISTINCT p.platform) AS platform_count
        FROM creator_topic_posts tp
        JOIN creator_posts p ON p.id = tp.post_id
        JOIN creator_accounts a ON a.id = p.account_id
        WHERE tp.topic_id = ?
      `).get(topic.id);
      topic.creatorCount = Number(stats.creator_count || 0);
      topic.platformCount = Number(stats.platform_count || 0);
    }
    return topic;
  };

  const enrichVertical = (vertical) => {
    if (!vertical || !vertical.id) return vertical;
    const stats = store.db.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT creator_id) FROM creator_vertical_memberships WHERE vertical_id = ?) AS creator_count,
        (SELECT COUNT(DISTINCT pv.post_id) FROM creator_post_verticals pv WHERE pv.vertical_id = ?) AS post_count
    `).get(vertical.id, vertical.id);
    vertical.creatorCount = Number(stats.creator_count || 0);
    vertical.postCount = Number(stats.post_count || 0);
    return vertical;
  };

  const router = express.Router();

  router.use((req, res, next) => {
    if (!store.initialized) {
      try {
        store.initialize();
      } catch (error) {
        return res.status(503).json({
          success: false,
          error: 'creator_store_unavailable',
          detail: error.message
        });
      }
    }
    return next();
  });

  router.get('/verticals', (req, res, next) => {
    try {
      const items = store.listVerticals().map((item) => ({
        id: item.id,
        name: item.name || null,
        version: item.version || null,
        enabled: item.enabled === 1 || item.enabled === true,
        keywords: item.keywords || [],
        negativeKeywords: item.negativeKeywords || item.negative_keywords || []
      }));
      // enrich counts from db
      const enriched = items.map((item) => enrichVertical({
        id: item.id,
        name: item.name,
        version: item.version,
        enabled: item.enabled,
        keywords: item.keywords,
        negativeKeywords: item.negativeKeywords
      }));
      return res.json({
        success: true,
        data: { items: enriched.map((item) => ({
          id: item.id,
          name: item.name || null,
          version: item.version || null,
          enabled: item.enabled === 1 || item.enabled === true,
          creatorCount: item.creatorCount || 0,
          postCount: item.postCount || 0,
          keywords: item.keywords || [],
          negativeKeywords: item.negativeKeywords || []
        })) },
        meta: { count: enriched.length }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/creators', (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : 'verified';
      if (!STATUSES.has(status)) return res.status(400).json({ success: false, error: 'invalid_status' });
      const limit = integerQuery(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const result = store.listCreators({
        q: req.query.q ? String(req.query.q).trim() : '',
        status,
        vertical: req.query.vertical ? String(req.query.vertical) : null,
        platform: req.query.platform ? String(req.query.platform) : null,
        cursor: passCursor(req.query.cursor),
        limit
      });
      return res.json({
        success: true,
        data: { items: result.items.map(publicCreator) },
        meta: { count: result.items.length, nextCursor: result.nextCursor }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/creators/:id', (req, res, next) => {
    try {
      const creator = store.getCreator(req.params.id);
      if (!creator) return res.status(404).json({ success: false, error: 'creator_not_found' });
      return res.json({ success: true, data: publicCreator(creator) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/creators/:id/posts', (req, res, next) => {
    try {
      const limit = integerQuery(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const result = store.queryPosts({
        creatorId: req.params.id,
        q: req.query.q && String(req.query.q).trim() ? String(req.query.q).trim() : undefined,
        cursor: passCursor(req.query.cursor),
        limit
      });
      return res.json({
        success: true,
        data: { items: result.items.map((p) => publicPost(enrichPost(p))) },
        meta: { count: result.items.length, nextCursor: result.nextCursor }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/posts', (req, res, next) => {
    try {
      const limit = integerQuery(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const hot = boolQuery(req.query.hot);
      if (req.query.hot !== undefined && hot === null) return res.status(400).json({ success: false, error: 'invalid_hot' });
      const result = store.queryPosts({
        q: req.query.q && String(req.query.q).trim() ? String(req.query.q).trim() : undefined,
        cursor: passCursor(req.query.cursor),
        limit,
        vertical: req.query.vertical ? String(req.query.vertical) : null,
        platform: req.query.platform ? String(req.query.platform) : null,
        creator: req.query.creator ? String(req.query.creator) : null,
        since: req.query.since ? String(req.query.since) : null,
        hot
      });
      return res.json({
        success: true,
        data: { items: result.items.map((p) => publicPost(enrichPost(p))) },
        meta: { count: result.items.length, nextCursor: result.nextCursor }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/hot', (req, res, next) => {
    try {
      const window = resolveWindow(req.query.window);
      if (!window) return res.status(400).json({ success: false, error: 'invalid_window' });
      const type = req.query.type ? String(req.query.type) : 'post';
      if (!HOT_TYPES.has(type)) return res.status(400).json({ success: false, error: 'invalid_type' });
      const limit = integerQuery(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const vertical = req.query.vertical ? String(req.query.vertical) : null;
      const items = type === 'post'
        ? store.queryHotPosts({ windowHours: window.hours, vertical, limit }).items
        : store.queryHotTopics({ windowHours: window.hours, type, vertical, limit }).items;
      return res.json({
        success: true,
        data: { items: items.map((item) => type === 'post' ? publicPost(enrichPost(item)) : publicTopic(enrichTopic(item))) },
        meta: { window: window.key, type, count: items.length }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/topics', (req, res, next) => {
    try {
      const window = req.query.window ? resolveWindow(req.query.window) : null;
      if (req.query.window && !window) return res.status(400).json({ success: false, error: 'invalid_window' });
      const limit = integerQuery(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const result = store.queryTopics({
        q: req.query.q && String(req.query.q).trim() ? String(req.query.q).trim() : undefined,
        cursor: passCursor(req.query.cursor),
        limit,
        vertical: req.query.vertical ? String(req.query.vertical) : null,
        since: req.query.since ? String(req.query.since) : null,
        windowHours: window?.hours
      });
      return res.json({
        success: true,
        data: { items: result.items.map((t) => publicTopic(enrichTopic(t))) },
        meta: { count: result.items.length, nextCursor: result.nextCursor }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/topics/:id', (req, res, next) => {
    try {
      const topic = store.getCreatorTopic(req.params.id);
      if (!topic) return res.status(404).json({ success: false, error: 'topic_not_found' });
      return res.json({ success: true, data: publicTopic(enrichTopic(topic)) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/sources', (req, res, next) => {
    try {
      const items = store.listSourceCoverage();
      const summary = store.getCoverageSummary();
      return res.json({
        success: true,
        data: { items: items.map(publicSourceCoverage), summary },
        meta: { count: items.length }
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/changes', (req, res, next) => {
    try {
      const since = integerQuery(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
      if (since === null) return res.status(400).json({ success: false, error: 'invalid_since' });
      const limit = integerQuery(req.query.limit, 100, 1, 500);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_limit' });
      const result = store.listCreatorChanges({
        since,
        limit,
        vertical: req.query.vertical ? String(req.query.vertical) : null,
        platform: req.query.platform ? String(req.query.platform) : null,
        creator: req.query.creator ? String(req.query.creator) : null
      });
      if (result.expired) {
        return res.status(410).json({
          success: false,
          error: 'cursor_expired',
          resync: '/api/creators/v1/topics',
          oldest_cursor: result.oldestCursor,
          latest_cursor: result.latestCursor
        });
      }
      return res.json({
        success: true,
        data: { items: result.items.map(publicChange) },
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

  router.get('/capabilities', (req, res) => {
    return res.json({
      success: true,
      data: {
        apiVersion: '1.0',
        windows: Array.from(WINDOWS.keys()),
        hotTypes: Array.from(HOT_TYPES),
        statuses: Array.from(STATUSES),
        anonymous: ['verticals', 'creators', 'creators/:id', 'creators/:id/posts', 'posts', 'hot', 'topics', 'topics/:id', 'sources', 'changes', 'capabilities'],
        authenticated: ['stream', 'subscriptions', 'delivery-endpoints', 'outbox', 'admin/*']
      }
    });
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('[creators] error', error);
    return res.status(500).json({ success: false, error: 'creator_service_error', detail: error.message });
  });

  return router;
}

module.exports = {
  createCreatorsRouter
};