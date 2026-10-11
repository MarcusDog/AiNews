const express = require('express');
const { requireSessionUser } = require('../middleware/sessionAuth');

function integer(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

function optionalText(value, max = 160) {
  if (value === undefined) return undefined;
  const text = String(value).normalize('NFKC').trim();
  return text && [...text].length <= max ? text : null;
}

function resyncUrl(filters) {
  const params = new URLSearchParams();
  if (filters.vertical) params.set('vertical', filters.vertical);
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.creator) params.set('creator', filters.creator);
  return `/api/creators/v1/posts${params.size ? `?${params}` : ''}`;
}

function createCreatorStreamRouter(options = {}) {
  if (!options.store) throw new TypeError('Creator stream requires a store');
  const router = express.Router();
  const store = options.store;
  const requireUser = options.requireUser || requireSessionUser;
  const heartbeatMs = Math.max(Number(options.heartbeatMs || 15_000), 10);
  const batchLimit = Math.min(Math.max(Number(options.batchLimit || 100), 1), 500);

  router.get('/', requireUser, (req, res, next) => {
    const headerCursor = req.get('last-event-id');
    const requestedCursor = headerCursor ?? req.query.since;
    let since = integer(requestedCursor, 0, 0, Number.MAX_SAFE_INTEGER);
    const filters = {
      vertical: optionalText(req.query.vertical, 80),
      platform: optionalText(req.query.platform, 40),
      creator: optionalText(req.query.creator, 120)
    };
    if (since === null || Object.values(filters).some((value) => value === null)) {
      return res.status(400).json({ success: false, error: 'invalid_query' });
    }

    // A first-time browser subscriber tails from the current committed end.
    // Replay remains explicit through ?since= or Last-Event-ID.
    if (requestedCursor === undefined) {
      const bounds = store.listCreatorChanges({ since: Number.MAX_SAFE_INTEGER, limit: 1, ...filters });
      since = bounds.latestCursor;
    }

    let initial;
    try { initial = store.listCreatorChanges({ since, limit: batchLimit, ...filters }); }
    catch (error) { return next(error); }
    if (initial.expired) {
      return res.status(410).json({
        success: false,
        error: 'cursor_expired',
        resync: resyncUrl(filters),
        oldest_cursor: initial.oldestCursor,
        latest_cursor: initial.latestCursor
      });
    }

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    let closed = false;
    let lastSent = since;
    let flushing = false;
    let pending = false;
    const send = (event) => {
      if (closed || event.seq <= lastSent) return true;
      const payload = JSON.stringify(event);
      const writable = res.write(`id: ${event.seq}\nevent: ${event.eventType}\ndata: ${payload}\n\n`);
      lastSent = event.seq;
      if (!writable) res.once('drain', () => flush());
      return writable;
    };
    const flush = () => {
      if (closed) return;
      if (flushing) { pending = true; return; }
      flushing = true;
      try {
        let result = store.listCreatorChanges({ since: lastSent, limit: batchLimit, ...filters });
        while (!result.expired && result.items.length) {
          for (const event of result.items) if (!send(event)) return;
          if (result.items.length < batchLimit) break;
          result = store.listCreatorChanges({ since: lastSent, limit: batchLimit, ...filters });
        }
      } catch {
        res.end();
      } finally {
        flushing = false;
        if (pending) { pending = false; queueMicrotask(flush); }
      }
    };
    const unsubscribe = store.onCreatorEvent(() => flush());
    for (const event of initial.items) send(event);
    flush();
    const heartbeat = setInterval(() => {
      if (!closed) res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, heartbeatMs);
    heartbeat.unref?.();
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    return undefined;
  });

  return router;
}

module.exports = { createCreatorStreamRouter, resyncUrl };
