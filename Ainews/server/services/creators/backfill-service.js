const BLOCKED_STATUSES = new Set(['auth_expired', 'permission_missing', 'blocked']);

function minIso(values) {
  return values.filter(Boolean).sort()[0] || null;
}

function maxIso(values) {
  const sorted = values.filter(Boolean).sort();
  return sorted[sorted.length - 1] || null;
}

class BackfillService {
  constructor(options = {}) {
    if (!options.store || !options.collector) throw new TypeError('store and collector are required');
    this.store = options.store;
    this.collector = options.collector;
    this.now = options.now || (() => new Date().toISOString());
  }

  getState(account) {
    return this.store.db.prepare(
      'SELECT * FROM creator_backfills WHERE account_id = ?'
    ).get(account.id) || {
      account_id: account.id,
      state: account.backfillState || 'pending',
      next_cursor: null,
      oldest_fetched_at: null,
      newest_fetched_at: null,
      last_reconciled_at: null,
      history_limit_reason: null,
      pages_fetched: 0,
      items_fetched: 0
    };
  }

  async runAccount(account, options = {}) {
    const prior = this.getState(account);
    if (['complete', 'partial', 'blocked'].includes(prior.state) && !options.force) {
      return { status: prior.state, reason: prior.history_limit_reason };
    }
    const mode = prior.state === 'reconciling' ? 'reconcile' : 'backfill';
    const result = await this.collector.collectAccount(account, {
      mode,
      cursor: prior.next_cursor,
      budget: options.budget,
      signal: options.signal
    });
    if (result.status === 'paused' || result.status === 'locked') return result;
    if (BLOCKED_STATUSES.has(result.status)) {
      const reason = result.reason || result.status;
      this.store.updateBackfill(account.id, {
        state: 'blocked', nextCursor: prior.next_cursor, historyLimitReason: reason,
        pagesFetched: prior.pages_fetched, itemsFetched: prior.items_fetched, updatedAt: this.now()
      });
      return { status: 'blocked', reason };
    }
    if (result.status !== 'success') return result;

    const published = (result.posts || []).map((post) => post.publishedAt).filter(Boolean);
    const pagesFetched = Number(prior.pages_fetched || 0) + 1;
    const itemsFetched = Number(prior.items_fetched || 0) + (result.posts?.length || 0);
    const common = {
      pagesFetched,
      itemsFetched,
      oldestFetchedAt: minIso([prior.oldest_fetched_at, ...published]),
      newestFetchedAt: maxIso([prior.newest_fetched_at, ...published]),
      updatedAt: this.now()
    };
    if (result.partialReason) {
      this.store.updateBackfill(account.id, {
        ...common, state: 'partial', nextCursor: null, historyLimitReason: result.partialReason
      });
      return { status: 'partial', reason: result.partialReason };
    }
    if (mode === 'reconcile' && result.exhausted) {
      this.store.updateBackfill(account.id, {
        ...common, state: 'complete', nextCursor: null,
        lastReconciledAt: this.now(), historyLimitReason: null
      });
      return { status: 'complete' };
    }
    this.store.updateBackfill(account.id, {
      ...common,
      state: result.exhausted ? 'reconciling' : 'running',
      nextCursor: result.nextCursor ?? null,
      historyLimitReason: null
    });
    return { status: result.exhausted ? 'reconciling' : 'running', nextCursor: result.nextCursor ?? null };
  }

  listPending(limit = 100) {
    const rows = this.store.db.prepare(`
      SELECT a.*
      FROM creator_accounts a
      LEFT JOIN creator_backfills b ON b.account_id = a.id
      WHERE a.enabled = 1 AND COALESCE(b.state, a.backfill_state, 'pending')
        IN ('pending', 'running', 'reconciling')
      ORDER BY CASE COALESCE(b.state, a.backfill_state, 'pending')
        WHEN 'reconciling' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
        COALESCE(b.updated_at, a.updated_at), a.id
      LIMIT ?
    `).all(Math.min(Math.max(Number(limit || 100), 1), 500));
    return rows.map((row) => {
      const mapped = this.store.mapAccount(row);
      mapped.profileUrl = row.profile_url;
      mapped.verticalIds = this.store.db.prepare(
        'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
      ).all(row.creator_id).map((item) => item.vertical_id);
      return mapped;
    });
  }

  async runPending(options = {}) {
    const results = [];
    for (const account of this.listPending(options.limit)) {
      if (options.budget && options.budget.remaining <= 0) break;
      results.push(await this.runAccount(account, options));
    }
    return results;
  }
}

module.exports = BackfillService;
