function retryAfterMs(value, nowMs) {
  if (value === null || value === undefined || value === '') return null;
  if (/^\d+$/.test(String(value))) return Number(value) * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed - nowMs) : null;
}

class OutboxWorker {
  constructor(options = {}) {
    if (!options.store?.db) throw new TypeError('initialized store required');
    this.store = options.store;
    this.transports = options.transports || {};
    this.now = options.now || (() => new Date().toISOString());
    this.leaseMs = Math.max(Number(options.leaseMs || 60_000), 1000);
    this.maxAttempts = Math.max(Number(options.maxAttempts || 8), 1);
    this.afterSend = options.afterSend || null;
  }

  async runOnce(options = {}) {
    const now = this.now();
    const rows = this.store.claimDueOutbox({ now, leaseMs: this.leaseMs, limit: options.limit || 50 });
    const summary = { claimed: rows.length, delivered: 0, retried: 0, dead: 0 };
    for (const row of rows) {
      const transport = this.transports[row.endpoint.type];
      let response;
      try {
        if (!transport) throw new Error(`transport_unavailable:${row.endpoint.type}`);
        response = await transport({ outboxId: row.id, event: row.event, endpoint: row.endpoint });
      } catch (error) {
        this.store.finishOutboxAttempt(row.id, {
          status: row.attemptCount >= this.maxAttempts ? 'dead' : 'retry',
          attemptedAt: now, error: error.message,
          nextAttemptAt: new Date(Date.parse(now) + Math.min(3600, 60 * (2 ** Math.max(0, row.attemptCount - 1))) * 1000).toISOString()
        });
        summary[row.attemptCount >= this.maxAttempts ? 'dead' : 'retried'] += 1;
        continue;
      }
      if (this.afterSend) this.afterSend(row, response);
      const statusCode = Number(response?.status || 0);
      if (statusCode >= 200 && statusCode < 300) {
        this.store.finishOutboxAttempt(row.id, { status: 'delivered', attemptedAt: now, responseCode: statusCode, deliveredAt: now, nextAttemptAt: now });
        summary.delivered += 1;
      } else if (statusCode === 429 || statusCode >= 500 || statusCode === 0) {
        const retryMs = statusCode === 429 ? retryAfterMs(response?.retryAfter, Date.parse(now)) : null;
        const delayMs = retryMs ?? Math.min(3600, 60 * (2 ** Math.max(0, row.attemptCount - 1))) * 1000;
        const dead = row.attemptCount >= this.maxAttempts;
        this.store.finishOutboxAttempt(row.id, {
          status: dead ? 'dead' : 'retry', attemptedAt: now, responseCode: statusCode || null,
          error: response?.error || `http_${statusCode || 'network'}`,
          nextAttemptAt: dead ? now : new Date(Date.parse(now) + delayMs).toISOString()
        });
        summary[dead ? 'dead' : 'retried'] += 1;
      } else {
        this.store.finishOutboxAttempt(row.id, { status: 'dead', attemptedAt: now, responseCode: statusCode, error: `http_${statusCode}`, nextAttemptAt: now });
        summary.dead += 1;
      }
    }
    return summary;
  }

  replayDead(options = {}) {
    return this.store.replayDeadOutbox({ id: options.id, now: this.now() });
  }
}

module.exports = OutboxWorker;
module.exports.retryAfterMs = retryAfterMs;
