const express = require('express');
const { isAdminKeyValid } = require('../middleware/adminAuth');
const { CREATOR_VERTICALS } = require('../config/creatorVerticals');
const { validateCreatorCatalog, toStoreRecords } = require('../services/creators/creator-catalog');
const SubscriptionService = require('../services/creators/subscription-service');
const { requireSessionUser } = require('../middleware/sessionAuth');

const WINDOWS = new Map([['24h', 24], ['48h', 48], ['72h', 72]]);
const HOT_TYPES = new Set(['post', 'multi_creator', 'cross_platform']);
const REVIEW_STATUSES = new Set(['verified', 'candidate', 'rejected']);
const FORMULA_VERSION = Object.freeze({
  postHotness: 'creator-hotness-v1',
  topic: 'creator-topic-v1',
  vertical: 'vertical-v1'
});
const EVIDENCE_BOUNDARY = 'Only public metadata, metrics returned by the source, and openable HTTPS evidence URLs are exposed; credentials, raw bridge payloads, source cursors, and internal secrets are redacted.';

function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

function optionalText(value, max = 200) {
  if (value === undefined) return undefined;
  const text = String(value).normalize('NFKC').trim();
  if (!text || [...text].length > max) return null;
  return text;
}

function isoQuery(value) {
  if (value === undefined) return undefined;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sinceForWindow(window, now) {
  const hours = WINDOWS.get(window);
  return hours ? new Date(Date.parse(now) - hours * 3_600_000).toISOString() : null;
}

function publicPost(post = {}) {
  return {
    id: post.id,
    accountId: post.accountId,
    creatorId: post.creatorId,
    creatorName: post.creatorName,
    platform: post.platform,
    externalPostId: post.externalPostId,
    url: post.url,
    title: post.title,
    text: post.text,
    contentType: post.contentType,
    publishedAt: post.publishedAt,
    collectedAt: post.collectedAt,
    editedAt: post.editedAt,
    deletedAt: post.deletedAt,
    language: post.language,
    verticalIds: post.verticalIds || [],
    sourceConfidence: post.sourceConfidence,
    provenanceUrl: post.provenanceUrl,
    metrics: post.metrics,
    hotness: post.hotness || null,
    searchRank: Number.isFinite(post.searchRank) ? post.searchRank : null
  };
}

function createCreatorsRouter(options = {}) {
  if (!options.store) throw new TypeError('Creators router requires a store');
  const router = express.Router();
  const store = options.store;
  const service = options.service || null;
  const sourceRegistry = options.sourceRegistry || null;
  const now = options.now || (() => new Date().toISOString());
  const configuredAdminKey = options.adminKey === undefined ? process.env.ADMIN_API_KEY : options.adminKey;
  const requireUser = options.requireUser || requireSessionUser;
  const subscriptions = options.subscriptionService || new SubscriptionService({ store, now });
  const outboxWorker = options.outboxWorker || null;

  const meta = (extra = {}) => ({
    generatedAt: now(),
    sourceCoverage: store.getCoverageSummary(),
    formulaVersion: FORMULA_VERSION,
    evidenceBoundary: EVIDENCE_BOUNDARY,
    ...extra
  });
  const ok = (res, data, extra) => res.json({ success: true, data, meta: meta(extra) });

  const parseList = (req, config = {}) => {
    const limit = integer(req.query.limit, config.defaultLimit || 20, 1, config.maxLimit || 100);
    const q = optionalText(req.query.q, 200);
    const since = isoQuery(req.query.since);
    if (limit === null || q === null || since === null) return null;
    return { limit, q, since, cursor: req.query.cursor ? String(req.query.cursor) : undefined };
  };

  const requireAdmin = (req, res, next) => {
    if (!configuredAdminKey) return res.status(503).json({ success: false, error: 'admin_not_configured' });
    const provided = req.get('x-admin-api-key');
    if (!provided) return res.status(401).json({ success: false, error: 'admin_key_required' });
    if (!isAdminKeyValid(configuredAdminKey, provided)) {
      return res.status(403).json({ success: false, error: 'admin_key_invalid' });
    }
    return next();
  };

  router.get('/verticals', (req, res, next) => {
    try {
      const items = store.listVerticals();
      return ok(res, { items }, { count: items.length });
    } catch (error) { return next(error); }
  });

  router.get('/creators', (req, res, next) => {
    try {
      const query = parseList(req);
      const status = optionalText(req.query.status, 40);
      const vertical = optionalText(req.query.vertical, 80);
      const platform = optionalText(req.query.platform, 40);
      if (!query || status === null || vertical === null || platform === null
        || (status && !REVIEW_STATUSES.has(status))) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = store.listCreators({ ...query, status, vertical, platform });
      return ok(res, { items: result.items, next_cursor: result.nextCursor }, {
        count: result.items.length, limit: query.limit
      });
    } catch (error) { return next(error); }
  });

  router.get('/creators/:id/posts', (req, res, next) => {
    try {
      const creator = store.getCreator(req.params.id);
      if (!creator) return res.status(404).json({ success: false, error: 'creator_not_found' });
      const query = parseList(req);
      if (!query) return res.status(400).json({ success: false, error: 'invalid_query' });
      const result = store.queryPosts({ ...query, creator: req.params.id });
      return ok(res, { items: result.items.map(publicPost), next_cursor: result.nextCursor }, {
        count: result.items.length, limit: query.limit
      });
    } catch (error) { return next(error); }
  });

  router.get('/creators/:id', (req, res, next) => {
    try {
      const item = store.getCreator(req.params.id);
      if (!item) return res.status(404).json({ success: false, error: 'creator_not_found' });
      return ok(res, item);
    } catch (error) { return next(error); }
  });

  router.get('/posts', (req, res, next) => {
    try {
      const query = parseList(req);
      const vertical = optionalText(req.query.vertical, 80);
      const platform = optionalText(req.query.platform, 40);
      const creator = optionalText(req.query.creator, 120);
      const hot = req.query.hot === undefined ? false : ['1', 'true'].includes(String(req.query.hot).toLowerCase());
      if (!query || vertical === null || platform === null || creator === null
        || (req.query.hot !== undefined && !['0', '1', 'true', 'false'].includes(String(req.query.hot).toLowerCase()))) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = store.queryPosts({ ...query, vertical, platform, creator, hot });
      return ok(res, { items: result.items.map(publicPost), next_cursor: result.nextCursor }, {
        count: result.items.length, limit: query.limit
      });
    } catch (error) { return next(error); }
  });

  router.get('/hot', (req, res, next) => {
    try {
      const window = req.query.window || '24h';
      const type = req.query.type || 'post';
      const vertical = optionalText(req.query.vertical, 80);
      if (!WINDOWS.has(window) || !HOT_TYPES.has(type) || vertical === null) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const limit = integer(req.query.limit, 20, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_query' });
      const result = store.listHot({
        type, vertical, since: sinceForWindow(window, now()), limit
      });
      return ok(res, { items: result.items.map((item) => type === 'post' ? publicPost(item) : item) }, {
        window, type, count: result.items.length
      });
    } catch (error) { return next(error); }
  });

  router.get('/topics', (req, res, next) => {
    try {
      const query = parseList(req);
      const window = req.query.window || '72h';
      const vertical = optionalText(req.query.vertical, 80);
      if (!query || !WINDOWS.has(window) || vertical === null) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = store.queryTopics({
        ...query, vertical, since: query.since || sinceForWindow(window, now())
      });
      return ok(res, { items: result.items, next_cursor: result.nextCursor }, {
        window, count: result.items.length, limit: query.limit
      });
    } catch (error) { return next(error); }
  });

  router.get('/topics/:id', (req, res, next) => {
    try {
      const item = store.getCreatorTopic(req.params.id);
      if (!item) return res.status(404).json({ success: false, error: 'topic_not_found' });
      return ok(res, item);
    } catch (error) { return next(error); }
  });

  router.get('/sources', (req, res, next) => {
    try {
      const items = store.listSourceCoverage(sourceRegistry?.list?.() || []);
      return ok(res, { items }, { count: items.length });
    } catch (error) { return next(error); }
  });

  router.get('/changes', (req, res, next) => {
    try {
      const since = integer(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
      const limit = integer(req.query.limit, 100, 1, 500);
      const vertical = optionalText(req.query.vertical, 80);
      const platform = optionalText(req.query.platform, 40);
      const creator = optionalText(req.query.creator, 120);
      if (since === null || limit === null || vertical === null || platform === null || creator === null) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = store.listCreatorChanges({ since, limit, vertical, platform, creator });
      const params = new URLSearchParams();
      if (vertical) params.set('vertical', vertical);
      if (platform) params.set('platform', platform);
      if (creator) params.set('creator', creator);
      const suffix = params.size ? `?${params.toString()}` : '';
      if (result.expired) {
        return res.status(410).json({
          success: false,
          error: 'cursor_expired',
          resync: `/api/creators/v1/posts${suffix}`,
          oldest_cursor: result.oldestCursor,
          latest_cursor: result.latestCursor
        });
      }
      return ok(res, { items: result.items }, {
        since,
        next_cursor: result.nextCursor,
        oldest_cursor: result.oldestCursor,
        latest_cursor: result.latestCursor
      });
    } catch (error) { return next(error); }
  });

  router.get('/subscriptions', requireUser, (req, res, next) => {
    try {
      const items = subscriptions.listSubscriptions(req.authUser.id);
      return ok(res, { items }, { count: items.length });
    } catch (error) { return next(error); }
  });

  router.post('/subscriptions', requireUser, (req, res, next) => {
    try { return ok(res, subscriptions.createSubscription(req.authUser.id, req.body || {})); }
    catch (error) { return next(error); }
  });

  router.patch('/subscriptions/:id', requireUser, (req, res, next) => {
    try {
      const item = subscriptions.updateSubscription(req.authUser.id, req.params.id, req.body || {});
      if (!item) return res.status(404).json({ success: false, error: 'subscription_not_found' });
      return ok(res, item);
    } catch (error) { return next(error); }
  });

  router.delete('/subscriptions/:id', requireUser, (req, res, next) => {
    try {
      const removed = subscriptions.deleteSubscription(req.authUser.id, req.params.id);
      if (!removed) return res.status(404).json({ success: false, error: 'subscription_not_found' });
      return ok(res, { removed: true });
    } catch (error) { return next(error); }
  });

  router.get('/delivery-endpoints', requireUser, (req, res, next) => {
    try {
      const items = subscriptions.listEndpoints(req.authUser.id);
      return ok(res, { items }, { count: items.length });
    } catch (error) { return next(error); }
  });

  router.post('/delivery-endpoints', requireUser, (req, res, next) => {
    try { return ok(res, subscriptions.createEndpoint(req.authUser.id, req.body || {})); }
    catch (error) { return next(error); }
  });

  router.patch('/delivery-endpoints/:id', requireUser, (req, res, next) => {
    try {
      const item = subscriptions.updateEndpoint(req.authUser.id, req.params.id, req.body || {});
      if (!item) return res.status(404).json({ success: false, error: 'endpoint_not_found' });
      return ok(res, item);
    } catch (error) { return next(error); }
  });

  router.delete('/delivery-endpoints/:id', requireUser, (req, res, next) => {
    try {
      const removed = subscriptions.deleteEndpoint(req.authUser.id, req.params.id);
      if (!removed) return res.status(404).json({ success: false, error: 'endpoint_not_found' });
      return ok(res, { removed: true });
    } catch (error) { return next(error); }
  });

  router.post('/delivery-endpoints/:id/test', requireUser, async (req, res, next) => {
    try {
      if (!outboxWorker?.runOnce) {
        return res.status(503).json({ success: false, error: 'delivery_worker_unavailable' });
      }
      const outboxId = store.enqueueEndpointTest(req.authUser.id, req.params.id, { now: now() });
      if (!outboxId) return res.status(404).json({ success: false, error: 'endpoint_not_found' });
      await outboxWorker.runOnce({ id: outboxId, limit: 1 });
      const delivery = store.listDeliveries(req.authUser.id, { limit: 100 })
        .find((item) => item.id === outboxId);
      return ok(res, delivery);
    } catch (error) { return next(error); }
  });

  router.get('/deliveries', requireUser, (req, res, next) => {
    try {
      const limit = integer(req.query.limit, 50, 1, 100);
      if (limit === null) return res.status(400).json({ success: false, error: 'invalid_query' });
      const items = store.listDeliveries(req.authUser.id, { limit });
      return ok(res, { items }, { count: items.length, limit });
    } catch (error) { return next(error); }
  });

  router.post('/admin/creators/import', requireAdmin, (req, res, next) => {
    try {
      const catalog = validateCreatorCatalog(req.body, { verticals: CREATOR_VERTICALS });
      const records = toStoreRecords(catalog);
      store.upsertCreators(records.creators);
      store.upsertAccounts(records.accounts);
      return ok(res, {
        creatorCount: records.creators.length,
        accountCount: records.accounts.length,
        catalogVersion: catalog.version
      });
    } catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ success: false, error: 'invalid_catalog', message: error.message });
      return next(error);
    }
  });

  router.post('/admin/refresh', requireAdmin, async (req, res, next) => {
    try {
      if (!service?.tick) return res.status(503).json({ success: false, error: 'creator_service_unavailable' });
      const result = await service.tick();
      return ok(res, result);
    } catch (error) { return next(error); }
  });

  router.post('/admin/backfill', requireAdmin, async (req, res, next) => {
    try {
      const accountId = optionalText(req.body?.accountId, 160);
      if (!accountId) return res.status(400).json({ success: false, error: 'account_id_required' });
      const row = store.db.prepare('SELECT * FROM creator_accounts WHERE id = ?').get(accountId);
      if (!row) return res.status(404).json({ success: false, error: 'account_not_found' });
      if (!service?.backfillService?.runAccount) {
        return res.status(503).json({ success: false, error: 'backfill_service_unavailable' });
      }
      const result = await service.backfillService.runAccount(store.mapAccount(row), {
        force: req.body?.force === true,
        budget: service.requestBudget?.()
      });
      return ok(res, { accountId, ...result });
    } catch (error) { return next(error); }
  });

  router.get('/admin/backfills', requireAdmin, (req, res, next) => {
    try {
      const query = parseList(req);
      const state = optionalText(req.query.state, 40);
      const platform = optionalText(req.query.platform, 40);
      if (!query || state === null || platform === null) {
        return res.status(400).json({ success: false, error: 'invalid_query' });
      }
      const result = store.listBackfills({ ...query, state, platform });
      return ok(res, { items: result.items, next_cursor: result.nextCursor }, {
        count: result.items.length, limit: query.limit
      });
    } catch (error) { return next(error); }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof TypeError) {
      return res.status(400).json({ success: false, error: error.code || error.message || 'invalid_request' });
    }
    if (['invalid_cursor', 'cursor_mismatch', 'invalid_query'].includes(error?.code || error?.message)) {
      return res.status(400).json({ success: false, error: error.code || error.message });
    }
    return res.status(500).json({ success: false, error: 'creator_service_error' });
  });
  return router;
}

module.exports = {
  EVIDENCE_BOUNDARY,
  FORMULA_VERSION,
  createCreatorsRouter,
  publicPost
};
