const express = require('express');
const { requireSessionUser } = require('../middleware/sessionAuth');
const { RunEventStream } = require('../services/agent/run-event-stream');

const MAX_PAGE = 100;
const RUN_STATUS_POLL_MS = 100;
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const errorStatus = Object.freeze({
  invalid_input: 400, input_too_large: 413, not_found: 404, active_run_exists: 409,
  request_key_conflict: 409, session_archived: 409, invalid_transition: 409, run_terminal: 409,
  invalid_cursor: 400
});

function safeError(res, error) {
  const status = errorStatus[error?.code] || 500;
  res.status(status).json({ success: false, error: status === 404 ? 'not_found' : status === 409 ? 'conflict' : status < 500 ? 'invalid_request' : 'request_failed' });
}
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function optionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}
function runEventProjection(event) {
  return { sequence: event.sequence, type: event.type, payload: event.payload, createdAt: event.createdAt };
}
function hasOnlyEmptyBody(body) {
  return body === undefined || (body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);
}

function createAgentRunsRouter({ store, runtime, requireUser = requireSessionUser, scopesForUser, eventStream, heartbeatMs } = {}) {
  if (!store || typeof store.createSession !== 'function') throw new TypeError('Agent routes require an AgentStore');
  if (!runtime || typeof runtime.run !== 'function') throw new TypeError('Agent routes require an AgentRuntime');
  if (typeof scopesForUser !== 'function') throw new TypeError('Agent routes require server scope mapping');
  const router = express.Router();
  const stream = eventStream || new RunEventStream({ store, ...(heartbeatMs === undefined ? {} : { heartbeatMs }) });
  const controllers = new Map();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, requireUser, (req, res, next) => {
    if (typeof req.authUser?.id !== 'string' || !req.authUser.id.trim()) {
      return res.status(401).json({ success: false, error: 'authentication_required' });
    }
    req.agentUserId = req.authUser.id;
    next();
  });

  router.get('/sessions', (req, res) => {
    const limit = integer(req.query.limit, 50, 1, MAX_PAGE);
    const includeArchived = optionalBoolean(req.query.includeArchived);
    if (limit === null || includeArchived === null) return res.status(400).json({ success: false, error: 'invalid_request' });
    const input = { userId: req.agentUserId, limit, ...(includeArchived === undefined ? {} : { includeArchived }) };
    if (req.query.before !== undefined || req.query.beforeUpdatedAt !== undefined) {
      const beforeUpdatedAt = integer(req.query.beforeUpdatedAt, undefined, 0, Number.MAX_SAFE_INTEGER);
      if (typeof req.query.before !== 'string' || !req.query.before || beforeUpdatedAt === null || beforeUpdatedAt === undefined) return res.status(400).json({ success: false, error: 'invalid_request' });
      input.beforeSessionId = req.query.before;
      input.beforeSessionUpdatedAt = beforeUpdatedAt;
    }
    try {
      const items = store.listSessions(input);
      const last = items.at(-1);
      res.status(200).json({ success: true, data: { items, nextCursor: items.length === limit && last ? { before: last.id, beforeUpdatedAt: last.updatedAt } : null } });
    } catch (error) { safeError(res, error); }
  });

  router.post('/sessions', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'title')) return res.status(400).json({ success: false, error: 'invalid_request' });
    try { res.status(201).json({ success: true, data: store.createSession({ userId: req.agentUserId, ...(body.title === undefined ? {} : { title: body.title }) }) }); }
    catch (error) { safeError(res, error); }
  });

  router.get('/sessions/:sessionId', (req, res) => {
    try { res.status(200).json({ success: true, data: store.getSession({ userId: req.agentUserId, sessionId: req.params.sessionId }) }); }
    catch (error) { safeError(res, error); }
  });
  router.patch('/sessions/:sessionId', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'title')) return res.status(400).json({ success: false, error: 'invalid_request' });
    try { res.status(200).json({ success: true, data: store.updateSessionTitle({ userId: req.agentUserId, sessionId: req.params.sessionId, title: body.title }) }); }
    catch (error) { safeError(res, error); }
  });
  router.post('/sessions/:sessionId/archive', (req, res) => {
    if (!hasOnlyEmptyBody(req.body)) return res.status(400).json({ success: false, error: 'invalid_request' });
    try { res.status(200).json({ success: true, data: store.archiveSession({ userId: req.agentUserId, sessionId: req.params.sessionId }) }); }
    catch (error) { safeError(res, error); }
  });
  router.get('/sessions/:sessionId/messages', (req, res) => {
    const limit = integer(req.query.limit, 50, 1, MAX_PAGE);
    if (limit === null) return res.status(400).json({ success: false, error: 'invalid_request' });
    try {
      const items = store.listMessages({ userId: req.agentUserId, sessionId: req.params.sessionId, limit, ...(req.query.before === undefined ? {} : { beforeMessageId: req.query.before }) });
      res.status(200).json({ success: true, data: { items, nextCursor: items.length === limit ? items[0]?.id || null : null } });
    } catch (error) { safeError(res, error); }
  });
  router.get('/sessions/:sessionId/runs/:runId', (req, res) => {
    try {
      const session = store.getSession({ userId: req.agentUserId, sessionId: req.params.sessionId });
      const run = store.getRun({ userId: req.agentUserId, runId: req.params.runId });
      if (run.sessionId !== session.id) return res.status(404).json({ success: false, error: 'not_found' });
      res.status(200).json({ success: true, data: run });
    } catch (error) { safeError(res, error); }
  });
  router.get('/sessions/:sessionId/runs', (req, res) => {
    const limit = integer(req.query.limit, 50, 1, MAX_PAGE);
    if (limit === null) return res.status(400).json({ success: false, error: 'invalid_request' });
    try {
      const items = store.listRuns({ userId: req.agentUserId, sessionId: req.params.sessionId, limit, ...(req.query.before === undefined ? {} : { beforeRunId: req.query.before }) });
      res.status(200).json({ success: true, data: { items, nextCursor: items.length === limit ? items.at(-1)?.id || null : null } });
    } catch (error) { safeError(res, error); }
  });

  router.post('/sessions/:sessionId/runs', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'message') || typeof body.message !== 'string' || !body.message.trim()) return res.status(400).json({ success: false, error: 'invalid_request' });
    const requestKey = req.get('Idempotency-Key');
    if (typeof requestKey !== 'string' || !requestKey.trim() || requestKey.length > 200) return res.status(400).json({ success: false, error: 'invalid_request' });
    try {
      const userId = req.agentUserId;
      const scopes = scopesForUser(req.authUser);
      if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) return res.status(500).json({ success: false, error: 'request_failed' });
      const run = store.createRun({ userId, sessionId: req.params.sessionId, requestKey, request: { message: body.message } });
      if (run.status === 'queued' && !controllers.has(run.id)) {
        const controller = new AbortController();
        const execution = { controller, claimed: false, statusPoll: null };
        controllers.set(run.id, execution);
        const onClaim = () => {
          if (execution.claimed) return;
          execution.claimed = true;
          execution.statusPoll = setInterval(() => {
            try {
              if (store.getRun({ userId, runId: run.id }).status !== 'running') controller.abort();
            } catch { controller.abort(); }
          }, RUN_STATUS_POLL_MS);
          execution.statusPoll.unref?.();
        };
        const failIfOwnedOrUnclaimed = () => {
          const current = store.getRun({ userId, runId: run.id });
          // A durable row is terminalized only by the worker that received its
          // successful atomic-claim callback. An unclaimed queued row stays
          // retryable; a running row may belong to a different process.
          if (execution.claimed && !TERMINAL.has(current.status)) {
            store.transitionRun({ userId, runId: run.id, status: 'failed', payload: { code: 'runtime_failed', message: 'Agent execution failed.' } });
          }
        };
        setImmediate(() => Promise.resolve().then(() => runtime.run({ userId, sessionId: run.sessionId, runId: run.id, scopes, signal: controller.signal, onClaim }))
          .then(() => {
            failIfOwnedOrUnclaimed();
          })
          .catch(() => {
            try {
              failIfOwnedOrUnclaimed();
            } catch { /* keep runtime failures private */ }
          })
          .finally(() => {
            clearInterval(execution.statusPoll);
            if (controllers.get(run.id) === execution) controllers.delete(run.id);
          }));
      }
      res.status(202).json({ success: true, data: run });
    } catch (error) { safeError(res, error); }
  });

  router.get('/runs/:runId', (req, res) => {
    try { res.status(200).json({ success: true, data: store.getRun({ userId: req.agentUserId, runId: req.params.runId }) }); }
    catch (error) { safeError(res, error); }
  });
  router.get('/runs/:runId/events', (req, res) => {
    try {
      const format = req.query.format;
      const isJson = format === 'json';
      const allowedKeys = isJson ? new Set(['format', 'since', 'limit']) : new Set(['format', 'since']);
      if ((format !== undefined && format !== 'sse' && format !== 'json') ||
          Object.keys(req.query).some(key => !allowedKeys.has(key)) ||
          Object.values(req.query).some(value => typeof value !== 'string')) {
        return res.status(400).json({ success: false, error: 'invalid_request' });
      }
      // Ownership is checked before either representation starts.
      store.getRun({ userId: req.agentUserId, runId: req.params.runId });
      if (isJson) {
        const limit = integer(req.query.limit, 100, 1, MAX_PAGE);
        let afterSequence;
        try { afterSequence = stream.parseCursor({ lastEventId: req.get('Last-Event-ID'), since: req.query.since }); }
        catch (error) { return safeError(res, error); }
        if (limit === null) return res.status(400).json({ success: false, error: 'invalid_request' });
        const events = store.listEvents({ userId: req.agentUserId, runId: req.params.runId, afterSequence, limit }).map(runEventProjection);
        return res.status(200).json({ success: true, data: { items: events, nextCursor: events.length === limit ? events.at(-1).sequence : null } });
      }
      const afterSequence = stream.parseCursor({ lastEventId: req.get('Last-Event-ID'), since: req.query.since });
      stream.connect({ userId: req.agentUserId, runId: req.params.runId, req, res, afterSequence });
      return undefined;
    } catch (error) { safeError(res, error); }
  });
  router.post('/runs/:runId/cancel', (req, res) => {
    if (!hasOnlyEmptyBody(req.body)) return res.status(400).json({ success: false, error: 'invalid_request' });
    try {
      const userId = req.agentUserId;
      const current = store.getRun({ userId, runId: req.params.runId });
      if (!TERMINAL.has(current.status)) {
        try {
          store.cancelRun({ userId, runId: req.params.runId, payload: { code: 'cancelled', message: 'Agent run cancelled.' } });
          controllers.get(current.id)?.controller.abort();
        } catch (error) {
          if (error.code !== 'invalid_transition') throw error;
          const latest = store.getRun({ userId, runId: req.params.runId });
          if (!TERMINAL.has(latest.status)) throw error;
        }
      }
      res.status(200).json({ success: true, data: store.getRun({ userId, runId: req.params.runId }) });
    } catch (error) { safeError(res, error); }
  });

  router.close = () => {
    for (const execution of controllers.values()) {
      execution.controller.abort();
      clearInterval(execution.statusPoll);
    }
    controllers.clear();
    stream.close?.();
  };
  return router;
}

module.exports = { createAgentRunsRouter, safeError, integer };
