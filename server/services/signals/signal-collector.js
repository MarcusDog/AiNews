const { normalizeSignal } = require('./signal-normalizer');

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function errorMessage(error) {
  return String(error?.message || error || 'unknown error').slice(0, 1000);
}

function structuredError(result) {
  if (!Array.isArray(result?.errors) || !result.errors.length) return 'adapter reported failure';
  return result.errors.map((item) => errorMessage(item?.error || item)).join('; ').slice(0, 1000);
}

class SignalCollector {
  constructor(options = {}) {
    if (!options.store) throw new TypeError('SignalCollector requires a store');
    this.catalog = Array.isArray(options.catalog) ? options.catalog : [];
    this.store = options.store;
    this.adapters = options.adapters || {};
    this.concurrency = clampInteger(options.concurrency, 3, 1, 10);
    this.now = options.now || (() => new Date());
    this.running = false;
  }

  skippedSource(source) {
    if (!source.enabled) return { id: source.id, status: 'skipped', reason: 'disabled', received: 0, saved: 0 };
    if (!source.configured) return { id: source.id, status: 'skipped', reason: 'unconfigured', received: 0, saved: 0 };
    if (!source.schedulable) return { id: source.id, status: 'skipped', reason: 'unschedulable', received: 0, saved: 0 };
    return null;
  }

  async collectSource(source, options) {
    const skipped = this.skippedSource(source);
    if (skipped) return skipped;

    const adapter = this.adapters[source.adapter];
    const startedAt = this.now();
    const runId = this.store.startSourceRun(source.id, startedAt);
    if (!adapter || typeof adapter.collect !== 'function') {
      const error = `adapter unavailable: ${source.adapter}`;
      this.store.finishSourceRun(runId, { status: 'failure', error, finishedAt: this.now() });
      return { id: source.id, status: 'failure', received: 0, saved: 0, invalid: 0, duplicate: 0, error };
    }

    try {
      const adapterResult = await adapter.collect(source, {
        limit: options.itemLimit,
        now: startedAt
      });
      const wrapped = Array.isArray(adapterResult) ? { status: 'success', items: adapterResult } : (adapterResult || {});
      const declaredStatus = wrapped.status || 'success';
      if (declaredStatus === 'unconfigured' || declaredStatus === 'skipped') {
        this.store.finishSourceRun(runId, {
          status: 'skipped',
          received: 0,
          saved: 0,
          finishedAt: this.now()
        });
        return {
          id: source.id,
          status: 'skipped',
          reason: declaredStatus,
          received: 0,
          saved: 0,
          invalid: 0,
          duplicate: 0
        };
      }
      if (declaredStatus === 'failure') throw new Error(structuredError(wrapped));

      const rawItems = Array.isArray(wrapped.items) ? wrapped.items : [];
      const normalizedById = new Map();
      let invalid = 0;
      for (const raw of rawItems) {
        try {
          const normalized = normalizeSignal(raw, source, { now: this.now() });
          normalizedById.set(normalized.id, normalized);
        } catch {
          invalid += 1;
        }
      }
      const normalized = [...normalizedById.values()];
      const duplicate = rawItems.length - invalid - normalized.length;
      const persisted = this.store.upsertSignals(normalized);
      const saved = persisted.inserted + persisted.updated;
      this.store.finishSourceRun(runId, {
        status: 'success',
        received: rawItems.length,
        saved,
        finishedAt: this.now()
      });
      return {
        id: source.id,
        status: 'success',
        received: rawItems.length,
        saved,
        inserted: persisted.inserted,
        updated: persisted.updated,
        invalid,
        duplicate,
        metadata: Object.fromEntries(
          Object.entries(wrapped).filter(([key]) => !['status', 'items', 'errors'].includes(key))
        )
      };
    } catch (error) {
      const message = errorMessage(error);
      this.store.finishSourceRun(runId, {
        status: 'failure',
        error: message,
        finishedAt: this.now()
      });
      return {
        id: source.id,
        status: 'failure',
        received: 0,
        saved: 0,
        invalid: 0,
        duplicate: 0,
        error: message
      };
    }
  }

  async collectAll(options = {}) {
    if (this.running) {
      return {
        status: 'skipped',
        reason: 'refresh_in_progress',
        startedAt: null,
        finishedAt: null,
        sources: [],
        received: 0,
        saved: 0,
        skipped: 0,
        errors: []
      };
    }

    this.running = true;
    const startedAt = this.now().toISOString();
    try {
      const sourceLimit = clampInteger(options.sourceLimit, this.catalog.length || 1, 1, this.catalog.length || 1);
      const catalog = this.catalog.slice(0, sourceLimit);
      const results = new Array(catalog.length);
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < catalog.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await this.collectSource(catalog[index], {
            itemLimit: clampInteger(options.itemLimit, 40, 1, 500)
          });
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(this.concurrency, Math.max(catalog.length, 1)) },
        () => worker()
      ));

      const errors = results.filter((item) => item.status === 'failure').map((item) => ({
        sourceId: item.id,
        error: item.error
      }));
      return {
        status: errors.length === results.length && results.length ? 'failure' : 'success',
        startedAt,
        finishedAt: this.now().toISOString(),
        sources: results,
        received: results.reduce((sum, item) => sum + (item.received || 0), 0),
        saved: results.reduce((sum, item) => sum + (item.saved || 0), 0),
        skipped: results.reduce((sum, item) => sum + (item.invalid || 0) + (item.duplicate || 0), 0),
        errors
      };
    } finally {
      this.running = false;
    }
  }
}

module.exports = SignalCollector;
