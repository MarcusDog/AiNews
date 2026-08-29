const crypto = require('node:crypto');
const { detectCreatorEvents } = require('./creator-event-detector');

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

class CreatorCollector {
  constructor(options = {}) {
    if (!options.store || !options.sourceRegistry || !options.connectorResolver) {
      throw new TypeError('store, sourceRegistry and connectorResolver are required');
    }
    this.store = options.store;
    this.sourceRegistry = options.sourceRegistry;
    this.connectorResolver = options.connectorResolver;
    this.eventPublisher = options.eventPublisher || null;
    this.maxConcurrency = Math.min(Math.max(Number(options.maxConcurrency || 4), 1), 16);
    this.now = options.now || (() => new Date().toISOString());
    this.locks = new Set();
  }

  async collectMany(accounts = [], options = {}) {
    return mapLimit(accounts, this.maxConcurrency, (account) => this.collectAccount(account, options));
  }

  async collectAccount(account, options = {}) {
    if (!account?.id) return { status: 'failed', reason: 'account_id_required' };
    if (this.locks.has(account.id)) return { status: 'locked', reason: 'account_collection_in_progress' };
    const budget = options.budget;
    if (budget && Number(budget.remaining) <= 0) {
      return { status: 'paused', reason: 'rate_budget_exhausted' };
    }
    this.locks.add(account.id);
    const startedAt = this.now();
    const runId = crypto.randomUUID();
    let sourceId = 'unknown';
    try {
      const resolved = await this.connectorResolver(account, options);
      if (!resolved?.sourceId || !resolved?.connector) throw new Error('connector_unavailable');
      sourceId = resolved.sourceId;
      if (budget) budget.remaining = Math.max(0, Number(budget.remaining) - 1);
      const result = await this.sourceRegistry.execute(
        sourceId,
        resolved.connector,
        account,
        {
          cursor: options.cursor ?? null,
          history: options.mode === 'backfill',
          reconciliation: options.mode === 'reconcile',
          recentLimit: options.recentLimit,
          signal: options.signal
        }
      );
      if (!result || !['online', 'success'].includes(result.status)) {
        this.store.recordRun?.({
          id: runId, sourceId, accountId: account.id, status: result?.status || 'failed',
          startedAt, finishedAt: this.now(), received: 0, saved: 0,
          error: result?.reason || result?.source?.lastFailureCode || null
        });
        return {
          status: result?.status || 'failed',
          reason: result?.reason || result?.source?.lastFailureCode || null,
          posts: [], nextCursor: options.cursor ?? null, exhausted: false
        };
      }
      const mode = options.mode || 'incremental';
      const collectedAt = result.collectedAt || this.now();
      const commit = () => this.store.commitPage({
        accountId: account.id,
        cursorKind: mode,
        posts: result.posts || [],
        nextCursor: result.nextCursor ?? null,
        exhausted: result.exhausted === true,
        collectedAt
      });
      let committed;
      let durableEvents = [];
      if (mode === 'incremental' && typeof this.store.applyCreatorStateChange === 'function') {
        const change = this.store.applyCreatorStateChange({
          producer: 'collector', entityType: 'account', entityId: account.id, stateVersion: collectedAt,
          applyState: () => {
            const existingIds = (result.posts || [])
              .filter((post) => this.store.getPost?.(post.id))
              .map((post) => post.id);
            const value = commit();
            return {
              before: { existingIds }, value,
              after: {
                posts: (result.posts || []).map((post) => ({
                  ...post,
                  creatorId: post.creatorId || account.creatorId,
                  verticalId: post.verticalId || post.verticalIds?.[0] || account.verticalIds?.[0] || null,
                  historical: false
                }))
              }
            };
          },
          detectEvents: detectCreatorEvents
        });
        committed = change.value;
        durableEvents = change.events;
      } else {
        committed = commit();
      }
      if (budget && result.rateLimit?.remaining !== null
        && Number(result.rateLimit?.remaining) <= 0) budget.remaining = 0;
      this.store.recordRun?.({
        id: runId, sourceId, accountId: account.id, status: 'success',
        startedAt, finishedAt: this.now(), received: result.posts?.length || 0,
        saved: Number(committed.inserted || 0) + Number(committed.updated || 0),
          metadata: { mode }
        });
      if (mode === 'incremental' && committed.inserted > 0 && this.eventPublisher) {
        this.eventPublisher({
          type: 'creator.posts.collected',
          accountId: account.id,
          postIds: (result.posts || []).map((post) => post.id),
          eventIds: durableEvents.map((event) => event.id),
          occurredAt: this.now()
        });
      }
      return {
        status: 'success',
        posts: result.posts || [],
        nextCursor: result.nextCursor ?? null,
        exhausted: result.exhausted === true,
        rateLimit: result.rateLimit || null,
        partialReason: result.partialReason || result.historyLimitReason || null,
        ...committed,
        eventCount: durableEvents.length
      };
    } catch (error) {
      try {
        this.store.recordRun?.({
          id: runId, sourceId, accountId: account.id, status: 'failed',
          startedAt, finishedAt: this.now(), received: 0, saved: 0, error: error.message
        });
      } catch {
        // The original acquisition or transaction error remains authoritative.
      }
      return { status: 'failed', reason: error.message, posts: [], nextCursor: options.cursor ?? null, exhausted: false };
    } finally {
      this.locks.delete(account.id);
    }
  }
}

module.exports = CreatorCollector;
module.exports.mapLimit = mapLimit;
