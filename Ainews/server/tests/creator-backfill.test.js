const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const BackfillService = require('../services/creators/backfill-service');
const CreatorService = require('../services/creators/creator-service');

const NOW = '2026-08-29T01:00:00.000Z';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-backfill-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW }]);
  store.upsertCreators([{
    id: 'creator-1', displayName: 'Creator', kind: 'person', reviewStatus: 'verified',
    reviewedAt: NOW, verticalIds: ['ai-tech']
  }]);
  store.upsertAccounts([{
    id: 'account-1', creatorId: 'creator-1', platform: 'youtube', externalAccountId: 'UC_one',
    profileUrl: 'https://www.youtube.com/channel/UC_one', region: 'global', sourceTier: 'L1',
    enabled: true, lastVerifiedAt: NOW, authState: 'not_required', backfillState: 'pending',
    nextRunAt: '2026-08-29T00:00:00.000Z'
  }]);
  return {
    directory, store,
    account: store.findVerifiedAccount('youtube', 'UC_one'),
    close() { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

function state(store) {
  return store.db.prepare('SELECT * FROM creator_backfills WHERE account_id = ?').get('account-1');
}

test('history cursor resumes after restart and requires a second reconciliation pass before complete', async () => {
  const current = fixture();
  try {
    const calls = [];
    const pages = [
      { status: 'success', posts: [{ publishedAt: '2026-08-20T00:00:00.000Z' }], nextCursor: 'page-2', exhausted: false },
      { status: 'success', posts: [{ publishedAt: '2026-07-01T00:00:00.000Z' }], nextCursor: null, exhausted: true },
      { status: 'success', posts: [], nextCursor: null, exhausted: true }
    ];
    const collector = {
      async collectAccount(account, options) {
        calls.push({ mode: options.mode, cursor: options.cursor });
        return pages.shift();
      }
    };
    const first = new BackfillService({ store: current.store, collector, now: () => NOW });
    await first.runAccount(current.account, { budget: { remaining: 3 } });
    assert.equal(state(current.store).state, 'running');
    assert.equal(state(current.store).next_cursor, 'page-2');

    const afterRestart = new BackfillService({ store: current.store, collector, now: () => NOW });
    await afterRestart.runAccount(current.account, { budget: { remaining: 2 } });
    assert.equal(state(current.store).state, 'reconciling');
    assert.equal(state(current.store).next_cursor, null);
    await afterRestart.runAccount(current.account, { budget: { remaining: 1 } });
    assert.equal(state(current.store).state, 'complete');
    assert.equal(state(current.store).last_reconciled_at, NOW);
    assert.deepEqual(calls, [
      { mode: 'backfill', cursor: null },
      { mode: 'backfill', cursor: 'page-2' },
      { mode: 'reconcile', cursor: null }
    ]);
  } finally {
    current.close();
  }
});

test('history limits become partial and auth or risk-control failures become blocked with reasons', async () => {
  const current = fixture();
  try {
    let result = { status: 'success', posts: [], exhausted: true, partialReason: 'api_history_window_90_days' };
    const service = new BackfillService({
      store: current.store,
      collector: { collectAccount: async () => result },
      now: () => NOW
    });
    await service.runAccount(current.account, { budget: { remaining: 2 } });
    assert.equal(state(current.store).state, 'partial');
    assert.equal(state(current.store).history_limit_reason, 'api_history_window_90_days');

    current.store.updateBackfill('account-1', { state: 'running', updatedAt: NOW });
    result = { status: 'permission_missing', posts: [], reason: 'risk_control' };
    await service.runAccount(current.account, { budget: { remaining: 1 } });
    assert.equal(state(current.store).state, 'blocked');
    assert.match(state(current.store).history_limit_reason, /risk_control|permission_missing/);
  } finally {
    current.close();
  }
});

test('creator service gives due incremental work priority and backfill only the remaining budget', async () => {
  const order = [];
  const budgetSeen = [];
  const creatorService = new CreatorService({
    env: { AYA_CREATOR_REQUEST_BUDGET: '3' },
    store: { listDueAccounts: () => [{ id: 'due-1' }, { id: 'due-2' }] },
    collector: {
      async collectMany(accounts, options) {
        order.push('incremental');
        options.budget.remaining -= accounts.length;
        return accounts.map(() => ({ status: 'success' }));
      }
    },
    backfillService: {
      async runPending(options) {
        order.push('backfill');
        budgetSeen.push(options.budget.remaining);
        return [];
      }
    },
    now: () => NOW
  });
  await creatorService.tick();
  assert.deepEqual(order, ['incremental', 'backfill']);
  assert.deepEqual(budgetSeen, [1]);
});

test('creator scheduler disable flag prevents every acquisition action', async () => {
  let calls = 0;
  const service = new CreatorService({
    env: { AYA_DISABLE_CREATOR_SCHEDULER: '1' },
    store: { listDueAccounts: () => { calls += 1; return []; } },
    collector: { collectMany: async () => { calls += 1; } },
    backfillService: { runPending: async () => { calls += 1; } }
  });
  assert.deepEqual(await service.tick(), { status: 'disabled' });
  assert.equal(calls, 0);
});

test('seed initialization schedules new accounts and never resets durable backfill progress on restart', () => {
  const current = fixture();
  try {
    current.store.db.prepare('DELETE FROM creator_accounts').run();
    current.store.db.prepare('DELETE FROM creators').run();
    const service = new CreatorService({
      env: {
        AYA_DISABLE_CREATOR_SCHEDULER: '1',
        AYA_CREATOR_SEEDS_PATH: path.join(__dirname, '../config/creatorSeeds.example.json')
      },
      store: current.store,
      collector: { collectMany: async () => [] },
      backfillService: { runPending: async () => [] },
      now: () => NOW
    });
    service.initialize();
    const firstAccount = current.store.db.prepare(
      'SELECT id, next_run_at FROM creator_accounts WHERE enabled = 1 ORDER BY id LIMIT 1'
    ).get();
    assert.equal(firstAccount.next_run_at, NOW);
    current.store.updateBackfill(firstAccount.id, {
      state: 'running', nextCursor: 'durable-page-7', pagesFetched: 6, itemsFetched: 300, updatedAt: NOW
    });
    service.initialize();
    const restored = current.store.db.prepare(`
      SELECT a.backfill_state, a.next_cursor AS account_cursor,
             b.state, b.next_cursor AS backfill_cursor, b.pages_fetched
      FROM creator_accounts a JOIN creator_backfills b ON b.account_id = a.id WHERE a.id = ?
    `).get(firstAccount.id);
    assert.deepEqual(restored, {
      backfill_state: 'running',
      account_cursor: 'durable-page-7',
      state: 'running',
      backfill_cursor: 'durable-page-7',
      pages_fetched: 6
    });
  } finally {
    current.close();
  }
});
