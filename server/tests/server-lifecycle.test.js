const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '../index.js');

test('server entrypoint guards listening behind require.main', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  assert.match(source, /if\s*\(require\.main\s*===\s*module\)/);
});

test('lifecycle flags do not infer behavior from NODE_ENV', () => {
  const { getLifecycleFlags } = require('../index');
  assert.deepEqual(getLifecycleFlags({ NODE_ENV: 'test' }), {
    disableCron: false,
    skipStartupRefresh: false,
    signalSourceLimit: undefined
  });
  assert.deepEqual(getLifecycleFlags({
    NODE_ENV: 'production', AINEWS_DISABLE_CRON: '1', AINEWS_SKIP_STARTUP_REFRESH: '1',
    AINEWS_SIGNAL_SOURCE_LIMIT: '2'
  }), { disableCron: true, skipStartupRefresh: true, signalSourceLimit: 2 });
});

test('disabled cron registers no jobs; enabled cron registers all explicit schedules', () => {
  const { registerCronJobs } = require('../index');
  const expressions = [];
  const cronLib = { schedule: (expression) => { expressions.push(expression); return { stop() {} }; } };
  const disabled = registerCronJobs({ env: { AINEWS_DISABLE_CRON: '1' }, cronLib });
  assert.deepEqual(disabled, []);

  const enabled = registerCronJobs({
    env: {}, cronLib,
    newsService: { updateAllNews: async () => ({}) },
    signalService: { refreshAll: async () => ({}), store: { purgeOldData: () => ({}) } },
    databaseService: { initialize: async () => {}, cleanOldNews: async () => 0 },
    diversityAuditService: { runDailyAudit: async () => ({ status: 'ok' }) }
  });
  assert.equal(enabled.length, 5);
  assert(expressions.includes('*/30 * * * *'));
  enabled.forEach((job) => job.stop());
});

test('startup skip initializes stores but performs no external refresh', async () => {
  const { initializeSystem } = require('../index');
  const calls = [];
  const result = await initializeSystem({
    env: { AINEWS_SKIP_STARTUP_REFRESH: '1', AINEWS_DISABLE_CRON: '1' },
    databaseService: { initialize: async () => { calls.push('database'); } },
    newsService: { setSocketIO: () => calls.push('socket'), updateAllNews: async () => calls.push('news') },
    signalService: { initialize: () => calls.push('signals'), refreshAll: async () => calls.push('signal-refresh') },
    diversityAuditService: { ensureTodayAudit: async () => calls.push('audit') },
    socketServer: {}
  });
  assert.deepEqual(calls, ['database', 'socket', 'signals']);
  assert.equal(result.skippedRefresh, true);
});
