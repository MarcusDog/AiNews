const assert = require('node:assert/strict');
const test = require('node:test');

const DailyRefreshService = require('../services/daily-refresh-service');

test('daily refresh isolates stage failures and still verifies recommendation readiness', async () => {
  const calls = [];
  const service = new DailyRefreshService({
    newsService: {
      async updateAllNews() { calls.push('news'); throw new Error('news transport unavailable'); }
    },
    signalService: {
      async refreshAll() { calls.push('signals'); return { collection: { status: 'success', received: 12 }, rebuild: { topicCount: 7 } }; },
      listCreatorOpportunities() { return [{ id: 'topic-1' }, { id: 'topic-2' }]; }
    },
    creatorService: {
      async tick() { calls.push('creators'); return { status: 'success', incremental: [{ status: 'success' }] }; }
    },
    creatorStore: {
      db: { prepare: () => ({ get: () => ({ count: 9 }) }) }
    },
    now: () => '2026-08-30T14:00:00.000Z'
  });

  const result = await service.run({ includeCreators: true });
  assert.deepEqual(calls, ['news', 'signals', 'creators']);
  assert.equal(result.status, 'degraded');
  assert.match(result.stages.news.error, /transport unavailable/);
  assert.equal(result.stages.signals.status, 'success');
  assert.equal(result.stages.creators.status, 'success');
  assert.deepEqual(result.readiness, {
    status: 'ready', signalOpportunities: 2, creatorTopics: 9
  });
});

test('daily refresh rejects overlap and exposes the last completed aggregate report', async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const service = new DailyRefreshService({
    newsService: { async updateAllNews() { await blocked; return { totalSaved: 3, errors: [] }; } },
    signalService: {
      async refreshAll() { return { collection: { status: 'success', received: 1 }, rebuild: { topicCount: 1 } }; },
      listCreatorOpportunities() { return [{ id: 'topic-1' }]; }
    },
    creatorService: { async tick() { return { status: 'success' }; } },
    creatorStore: { db: { prepare: () => ({ get: () => ({ count: 1 }) }) } }
  });

  const first = service.run();
  const overlapping = await service.run();
  assert.deepEqual(overlapping, { status: 'skipped', reason: 'refresh_in_progress' });
  release();
  const completed = await first;
  assert.equal(completed.status, 'success');
  assert.equal(service.getLastRun().runId, completed.runId);
});
