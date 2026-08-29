/**
 * Creator Alerts router (authenticated)
 *
 * Exposes:
 *   GET    /api/creators/v1/delivery-endpoints
 *   POST   /api/creators/v1/delivery-endpoints
 *   DELETE /api/creators/v1/delivery-endpoints/:id
 *   POST   /api/creators/v1/delivery-endpoints/:id/test
 *   GET    /api/creators/v1/subscriptions
 *   POST   /api/creators/v1/subscriptions
 *   DELETE /api/creators/v1/subscriptions/:id
 *   GET    /api/creators/v1/deliveries
 *
 * All routes require a valid session cookie. The Skill client must never
 * call any of these directly; this is operator/user only.
 *
 * The implementations are intentionally conservative: read-mostly,
 * audit-friendly, no outbound delivery yet (outbox writes happen but no
 * real webhook fan-out). Real signed-Webhook delivery is documented in
 * /openapi.json as a future capability, not implemented here.
 */

const express = require('express');
const crypto = require('node:crypto');

const shaId = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);
const now = () => new Date().toISOString();

function publicEndpoint(row) {
  return {
    id: row.id,
    type: row.type,
    destination: row.destination,
    enabled: row.enabled === 1 || row.enabled === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicSubscription(row) {
  let filters = {};
  try { filters = JSON.parse(row.filters_json || '{}'); } catch (_) { filters = {}; }
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1 || row.enabled === true,
    filters: {
      verticals: Array.isArray(filters.verticals) ? filters.verticals : [],
      minimumScore: typeof filters.minimumScore === 'number' ? filters.minimumScore : null
    },
    deliveryMode: row.delivery_mode || 'immediate',
    endpointIds: []
  };
}

function publicDelivery(row) {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    subscriptionId: row.subscription_id,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    eventType: row.event_type || null,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at || null,
    latestAttempt: row.last_attempt_status ? {
      attemptedAt: row.last_attempted_at,
      status: row.last_attempt_status,
      responseCode: row.last_response_code == null ? null : Number(row.last_response_code),
      error: row.last_error || null
    } : null
  };
}

function createAlertsRouter(options = {}) {
  const store = options.store;
  const getCurrentUser = options.getCurrentUser;
  if (!store) throw new TypeError('Alerts router requires a store');
  if (typeof getCurrentUser !== 'function') throw new TypeError('Alerts router requires getCurrentUser(req)');

  const router = express.Router();

  // Auth gate: every route needs an authenticated user.
  router.use(async (req, res, next) => {
    const user = await getCurrentUser(req);
    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: 'auth_required' });
    }
    req.user = user;
    return next();
  });

  // delivery-endpoints
  router.get('/delivery-endpoints', (req, res, next) => {
    try {
      const rows = store.db.prepare(`
        SELECT * FROM creator_delivery_endpoints WHERE user_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
      return res.json({ success: true, data: { items: rows.map(publicEndpoint) }, meta: { count: rows.length } });
    } catch (error) { return next(error); }
  });

  router.post('/delivery-endpoints', (req, res, next) => {
    try {
      const { type, destination } = req.body || {};
      if (!type || !destination) {
        return res.status(400).json({ success: false, error: 'type_and_destination_required' });
      }
      if (!['webhook', 'email', 'rss'].includes(type)) {
        return res.status(400).json({ success: false, error: 'invalid_endpoint_type' });
      }
      if (type === 'webhook' && !/^https:\/\//.test(String(destination))) {
        return res.status(400).json({ success: false, error: 'webhook_must_be_https' });
      }
      const id = `endpoint_${shaId(req.user.id, type, destination, now())}`;
      store.db.prepare(`
        INSERT INTO creator_delivery_endpoints (id, user_id, type, destination, secret_ref, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
      `).run(id, req.user.id, type, destination, now(), now());
      const row = store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE id = ?').get(id);
      return res.json({ success: true, data: publicEndpoint(row) });
    } catch (error) { return next(error); }
  });

  router.delete('/delivery-endpoints/:id', (req, res, next) => {
    try {
      const row = store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!row) return res.status(404).json({ success: false, error: 'endpoint_not_found' });
      store.db.prepare('DELETE FROM creator_delivery_endpoints WHERE id = ?').run(req.params.id);
      return res.json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (error) { return next(error); }
  });

  // POST /test: dry-run check that the endpoint is reachable conceptually.
  // We don't actually deliver (the real signed Webhook transport is not yet
  // wired here). Returns a synthetic test receipt the SPA can show without
  // polluting the audit ledger.
  router.post('/delivery-endpoints/:id/test', (req, res, next) => {
    try {
      const row = store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!row) return res.status(404).json({ success: false, error: 'endpoint_not_found' });
      const receiptId = `test_${shaId(row.id, now())}`;
      return res.json({
        success: true,
        data: {
          id: receiptId,
          status: 'success',
          endpoint: { id: row.id, type: row.type, destination: row.destination },
          attemptedAt: now(),
          responseCode: 200,
          message: 'Dry run recorded; real Webhook delivery is not yet implemented.'
        }
      });
    } catch (error) { return next(error); }
  });
  // subscriptions
  router.get('/subscriptions', (req, res, next) => {
    try {
      const rows = store.db.prepare(`
        SELECT * FROM creator_subscriptions WHERE user_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
      const items = rows.map((row) => {
        const sub = publicSubscription(row);
        const endpoints = store.db.prepare(`
          SELECT endpoint_id FROM creator_subscription_endpoints WHERE subscription_id = ?
        `).all(row.id).map((e) => e.endpoint_id);
        sub.endpointIds = endpoints;
        return sub;
      });
      return res.json({ success: true, data: { items }, meta: { count: items.length } });
    } catch (error) { return next(error); }
  });

  router.post('/subscriptions', (req, res, next) => {
    try {
      const { name, endpointIds, filters, deliveryMode } = req.body || {};
      if (!name || !Array.isArray(endpointIds) || endpointIds.length === 0) {
        return res.status(400).json({ success: false, error: 'name_and_endpoints_required' });
      }
      // validate endpoints belong to user
      const owned = store.db.prepare(`
        SELECT id FROM creator_delivery_endpoints WHERE user_id = ? AND id IN (${endpointIds.map(() => '?').join(',')})
      `).all(req.user.id, ...endpointIds).map((r) => r.id);
      if (owned.length !== endpointIds.length) {
        return res.status(403).json({ success: false, error: 'endpoint_not_owned' });
      }
      const id = `sub_${shaId(req.user.id, name, now())}`;
      store.db.prepare(`
        INSERT INTO creator_subscriptions (id, user_id, name, filters_json, delivery_mode, quiet_hours_json, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '{}', 1, ?, ?)
      `).run(id, req.user.id, name, JSON.stringify(filters || {}), deliveryMode || 'immediate', now(), now());
      const linkStmt = store.db.prepare(`
        INSERT INTO creator_subscription_endpoints (subscription_id, endpoint_id, created_at) VALUES (?, ?, ?)
      `);
      for (const endpointId of owned) linkStmt.run(id, endpointId, now());
      const row = store.db.prepare('SELECT * FROM creator_subscriptions WHERE id = ?').get(id);
      const sub = publicSubscription(row);
      sub.endpointIds = owned;
      return res.json({ success: true, data: sub });
    } catch (error) { return next(error); }
  });

  router.delete('/subscriptions/:id', (req, res, next) => {
    try {
      const row = store.db.prepare('SELECT * FROM creator_subscriptions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!row) return res.status(404).json({ success: false, error: 'subscription_not_found' });
      store.db.prepare('DELETE FROM creator_subscription_endpoints WHERE subscription_id = ?').run(req.params.id);
      store.db.prepare('DELETE FROM creator_subscriptions WHERE id = ?').run(req.params.id);
      return res.json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (error) { return next(error); }
  });

  // deliveries (audit trail)
  router.get('/deliveries', (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const rows = store.db.prepare(`
        SELECT o.*, a.status AS last_attempt_status, a.attempted_at AS last_attempted_at,
               a.response_code AS last_response_code, a.error AS last_error,
               (SELECT event_type FROM creator_events WHERE id = o.event_id) AS event_type
        FROM creator_delivery_outbox o
        LEFT JOIN creator_delivery_attempts a ON a.id = (
          SELECT id FROM creator_delivery_attempts WHERE outbox_id = o.id ORDER BY attempted_at DESC, id DESC LIMIT 1
        )
        WHERE o.endpoint_id IN (
          SELECT id FROM creator_delivery_endpoints WHERE user_id = ?
        ) OR o.subscription_id IN (
          SELECT id FROM creator_subscriptions WHERE user_id = ?
        )
        ORDER BY COALESCE(o.delivered_at, o.created_at) DESC
        LIMIT ?
      `).all(req.user.id, req.user.id, limit);
      return res.json({ success: true, data: { items: rows.map(publicDelivery) }, meta: { count: rows.length } });
    } catch (error) { return next(error); }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('[alerts] error', error);
    return res.status(500).json({ success: false, error: 'alerts_service_error', detail: error.message });
  });

  return router;
}

module.exports = { createAlertsRouter };