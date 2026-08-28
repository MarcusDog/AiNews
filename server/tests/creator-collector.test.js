const test = require('node:test');
const assert = require('node:assert/strict');

const CreatorCollector = require('../services/creators/creator-collector');

function account(id) {
  return {
    id,
    creatorId: `creator-${id}`,
    platform: 'youtube',
    externalAccountId: `UC_${id}`,
    profileUrl: `https://www.youtube.com/channel/UC_${id}`,
    verticalIds: ['ai-tech']
  };
}

function page(currentAccount, overrides = {}) {
  return {
    status: 'online',
    account: currentAccount,
    posts: [],
    nextCursor: null,
    exhausted: true,
    rateLimit: null,
    collectedAt: '2026-08-29T00:00:00.000Z',
    ...overrides
  };
}

test('collectMany enforces bounded concurrency', async () => {
  let active = 0;
  let maximum = 0;
  const collector = new CreatorCollector({
    maxConcurrency: 2,
    store: { commitPage: () => ({ inserted: 0, updated: 0 }), recordRun: () => {} },
    sourceRegistry: {
      async execute(sourceId, connector, currentAccount, options) {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 8));
        active -= 1;
        return connector.collect(currentAccount, options);
      }
    },
    connectorResolver: () => ({ sourceId: 'youtube-atom', connector: { collect: async (item) => page(item) } })
  });
  const results = await collector.collectMany(Array.from({ length: 6 }, (_, index) => account(String(index))));
  assert.equal(results.length, 6);
  assert.equal(maximum, 2);
});

test('account locks reject overlapping work and one source failure does not cancel siblings', async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const collector = new CreatorCollector({
    maxConcurrency: 3,
    store: { commitPage: () => ({ inserted: 0, updated: 0 }), recordRun: () => {} },
    sourceRegistry: {
      execute: async (sourceId, connector, currentAccount, options) => connector.collect(currentAccount, options)
    },
    connectorResolver: (currentAccount) => ({
      sourceId: 'youtube-atom',
      connector: {
        async collect(item) {
          if (item.id === 'slow') await waiting;
          if (item.id === 'broken') throw new Error('single-source-failure');
          return page(item);
        }
      }
    })
  });
  const first = collector.collectAccount(account('slow'));
  const locked = await collector.collectAccount(account('slow'));
  release();
  await first;
  assert.equal(locked.status, 'locked');
  const results = await collector.collectMany([account('ok'), account('broken'), account('ok-2')]);
  assert.deepEqual(results.map((item) => item.status), ['success', 'failed', 'success']);
});

test('cursor advances only through a successful page commit and historical pages emit no new-post events', async () => {
  const events = [];
  let shouldFail = true;
  const store = {
    commitPage(input) {
      if (shouldFail) throw new Error('commit-failed');
      assert.equal(input.nextCursor, 'page-2');
      return { inserted: 1, updated: 0 };
    },
    recordRun: () => {}
  };
  const currentAccount = account('history');
  const collector = new CreatorCollector({
    store,
    eventPublisher: (event) => events.push(event),
    sourceRegistry: { execute: async () => page(currentAccount, {
      posts: [{ id: 'post-1' }], nextCursor: 'page-2', exhausted: false
    }) },
    connectorResolver: () => ({ sourceId: 'youtube-atom', connector: {} })
  });
  assert.equal((await collector.collectAccount(currentAccount)).status, 'failed');
  assert.deepEqual(events, []);
  shouldFail = false;
  assert.equal((await collector.collectAccount(currentAccount, { mode: 'backfill' })).status, 'success');
  assert.deepEqual(events, []);
  assert.equal((await collector.collectAccount(currentAccount, { mode: 'incremental' })).status, 'success');
  assert.equal(events.length, 1);
});

test('an exhausted request budget pauses without network or cursor writes', async () => {
  let networks = 0;
  let writes = 0;
  const collector = new CreatorCollector({
    store: { commitPage: () => { writes += 1; }, recordRun: () => {} },
    sourceRegistry: { execute: async () => { networks += 1; } },
    connectorResolver: () => ({ sourceId: 'youtube-atom', connector: {} })
  });
  const result = await collector.collectAccount(account('budget'), { budget: { remaining: 0 } });
  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'rate_budget_exhausted');
  assert.equal(networks, 0);
  assert.equal(writes, 0);
});
