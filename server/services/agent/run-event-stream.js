const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function invalidCursor() {
  const error = new Error('invalid_cursor');
  error.code = 'invalid_cursor';
  return error;
}

function cursor(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw invalidCursor();
  }
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw invalidCursor();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw invalidCursor();
  return number;
}

class RunEventStream {
  constructor({ store, heartbeatMs = 15_000, batchLimit = 100, pollMs = 1_000 } = {}) {
    if (!store || typeof store.listEvents !== 'function' || typeof store.getRun !== 'function') throw new TypeError('Run event stream requires an AgentStore');
    if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 10 || !Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > 100 || !Number.isSafeInteger(pollMs) || pollMs < 10) throw new TypeError('Invalid stream bounds');
    this.store = store;
    this.heartbeatMs = heartbeatMs;
    this.batchLimit = batchLimit;
    this.pollMs = pollMs;
    this.listeners = new Set();
    this.pollTimer = null;
    this.unsubscribeStore = typeof store.onRunEvent === 'function' ? store.onRunEvent(event => this._notify(event)) : () => {};
  }

  parseCursor({ lastEventId, since } = {}) {
    const header = cursor(lastEventId);
    const query = cursor(since);
    if (header !== undefined && query !== undefined && header !== query) throw invalidCursor();
    return header ?? query ?? 0;
  }

  _notify(event) {
    for (const listener of this.listeners) {
      if (listener.userId === event.userId && listener.runId === event.runId) listener.wake();
    }
  }

  _startPolling() {
    if (this.pollTimer || this.listeners.size === 0) return;
    this.pollTimer = setInterval(() => {
      // The durable event table remains authoritative. Polling only wakes each
      // subscriber to reread its own user/run-scoped page from the store.
      for (const listener of this.listeners) listener.wake();
    }, this.pollMs);
    this.pollTimer.unref?.();
  }

  _stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  connect({ userId, runId, req, res, afterSequence = 0 } = {}) {
    const after = cursor(afterSequence);
    if (after === undefined) throw invalidCursor();
    const run = this.store.getRun({ userId, runId });
    const listener = { userId, runId, wake: null };
    let closed = false;
    let busy = false;
    let pendingWake = false;
    let lastSent = after;
    let waitingDrain = false;
    let heartbeat;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this._stopPolling();
      req?.removeListener('aborted', onRequestAborted);
      res.removeListener('close', cleanup);
      res.removeListener('drain', onDrain);
    };
    listener.cleanup = cleanup;
    listener.close = () => { cleanup(); res.end(); };
    const end = () => { if (!closed) { cleanup(); res.end(); } };
    const write = event => {
      // The DB projection deliberately omits owner/session/request metadata.
      const frame = `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify({ sequence: event.sequence, type: event.type, payload: event.payload, createdAt: event.createdAt })}\n\n`;
      lastSent = event.sequence;
      if (res.write(frame) === false) {
        waitingDrain = true;
        res.once('drain', onDrain);
      }
    };
    const flush = () => {
      if (closed || waitingDrain) return;
      if (busy) { pendingWake = true; return; }
      busy = true;
      try {
        const page = this.store.listEvents({ userId, runId, afterSequence: lastSent, limit: this.batchLimit });
        for (const event of page) {
          if (closed || waitingDrain) break;
          write(event);
        }
        const hasMore = page.length === this.batchLimit;
        if (!waitingDrain && hasMore) pendingWake = true;
        const latest = this.store.getRun({ userId, runId });
        if (!waitingDrain && !hasMore && TERMINAL.has(latest.status)) end();
      } catch {
        end();
      } finally {
        busy = false;
        if (pendingWake && !waitingDrain && !closed) {
          pendingWake = false;
          queueMicrotask(flush);
        }
      }
    };
    const onDrain = () => { waitingDrain = false; flush(); };
    const onRequestAborted = () => cleanup();
    listener.wake = flush;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    this.listeners.add(listener);
    this._startPolling();
    req?.once('aborted', onRequestAborted);
    res.once('close', cleanup);
    heartbeat = setInterval(() => {
      if (closed || waitingDrain) return;
      if (res.write(`: heartbeat ${Date.now()}\n\n`) === false) {
        waitingDrain = true;
        res.once('drain', onDrain);
      }
    }, this.heartbeatMs);
    heartbeat.unref?.();
    flush();
    if (TERMINAL.has(run.status) && lastSent >= after) {
      const remaining = this.store.listEvents({ userId, runId, afterSequence: lastSent, limit: 1 });
      if (!remaining.length) end();
    }
    return cleanup;
  }

  close() {
    this.unsubscribeStore();
    this._stopPolling();
    for (const listener of [...this.listeners]) listener.close();
  }
}

module.exports = { RunEventStream, cursor };
