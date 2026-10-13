const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentStore } = require('../services/agent/agent-store');

const indexPath = path.join(__dirname, '../index.js');
const lifecycleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-server-lifecycle-'));
process.env.AINEWS_DB_PATH = path.join(lifecycleDirectory, 'lifecycle.db');

test('server entrypoint guards listening behind require.main', () => {
  const source = fs.readFileSync(indexPath, 'utf8');
  assert.match(source, /if\s*\(require\.main\s*===\s*module\)/);
});

test('a second default server store does not recover a run owned by a live SQLite collaborator', t => {
  const liveWorkerStore = new AgentStore({ dbPath: process.env.AINEWS_DB_PATH }).initialize();
  const session = liveWorkerStore.createSession({ userId: 'live-worker', title: 'Still active' });
  const run = liveWorkerStore.createRun({ userId: 'live-worker', sessionId: session.id, requestKey: 'live', request: { message: 'Keep running' } });
  liveWorkerStore.startRun({ userId: 'live-worker', runId: run.id });
  t.after(() => liveWorkerStore.close());

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try { require('../index'); }
  finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal(liveWorkerStore.getRun({ userId: 'live-worker', runId: run.id }).status, 'running');
  assert.equal(liveWorkerStore.listEvents({ userId: 'live-worker', runId: run.id }).some(event => event.type === 'recovered'), false);
});

test('lifecycle flags do not infer behavior from NODE_ENV', () => {
  const { getLifecycleFlags } = require('../index');
  assert.deepEqual(getLifecycleFlags({ NODE_ENV: 'test' }), {
    disableCron: false,
    skipStartupRefresh: false,
    recoverAgentRuns: false,
    signalSourceLimit: undefined
  });
  assert.equal(getLifecycleFlags({ AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1' }).recoverAgentRuns, true);
  for (const value of ['0', 'true', 'yes', '']) {
    assert.equal(getLifecycleFlags({ AYA_AGENT_RECOVER_INTERRUPTED_RUNS: value }).recoverAgentRuns, false);
  }
  assert.deepEqual(getLifecycleFlags({
    NODE_ENV: 'production', AINEWS_DISABLE_CRON: '1', AINEWS_SKIP_STARTUP_REFRESH: '1', AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1',
    AINEWS_SIGNAL_SOURCE_LIMIT: '2'
  }), { disableCron: true, skipStartupRefresh: true, recoverAgentRuns: true, signalSourceLimit: 2 });
});

test('recovery helper is a no-op unless exact explicit opt-in is set', () => {
  const { recoverAgentRunsOnStartup } = require('../index');
  let calls = 0;
  assert.deepEqual(recoverAgentRunsOnStartup({ env: {}, store: { reconcileInterruptedRuns() { calls++; } } }), { recovered: 0, enabled: false });
  assert.equal(calls, 0);
  assert.deepEqual(recoverAgentRunsOnStartup({ env: { AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1' }, store: { reconcileInterruptedRuns() { calls++; return 3; } } }), { recovered: 3, enabled: true });
  assert.equal(calls, 1);
});

test('sole-worker restart remains active with recovery off and is durably reconciled with recovery on', t => {
  const makeInterruptedStore = name => {
    const dbPath = path.join(lifecycleDirectory, `${name}.db`);
    const previous = new AgentStore({ dbPath }).initialize();
    const session = previous.createSession({ userId: name, title: 'Interrupted' });
    const run = previous.createRun({ userId: name, sessionId: session.id, requestKey: `${name}-old`, request: { message: 'Old work' } });
    previous.startRun({ userId: name, runId: run.id });
    previous.close();
    return { dbPath, run, userId: name };
  };
  const { recoverAgentRunsOnStartup } = require('../index');
  const interruptedOff = makeInterruptedStore('restart-off');
  const offStore = new AgentStore({ dbPath: interruptedOff.dbPath }).initialize();
  t.after(() => offStore.close());
  assert.deepEqual(recoverAgentRunsOnStartup({ env: { AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '0' }, store: offStore }), { recovered: 0, enabled: false });
  assert.equal(offStore.getRun({ userId: interruptedOff.userId, runId: interruptedOff.run.id }).status, 'running');

  const interruptedOn = makeInterruptedStore('restart-on');
  const onStore = new AgentStore({ dbPath: interruptedOn.dbPath }).initialize();
  t.after(() => onStore.close());
  assert.deepEqual(recoverAgentRunsOnStartup({ env: { AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1' }, store: onStore }), { recovered: 1, enabled: true });
  assert.equal(onStore.getRun({ userId: interruptedOn.userId, runId: interruptedOn.run.id }).status, 'failed');
  assert.equal(onStore.listEvents({ userId: interruptedOn.userId, runId: interruptedOn.run.id }).at(-1).type, 'recovered');
  const next = onStore.createRun({ userId: interruptedOn.userId, sessionId: interruptedOn.run.sessionId, requestKey: 'restart-on-new', request: { message: 'Fresh work' } });
  assert.equal(next.status, 'queued');
});

test('startup recovery errors are sanitized and abort the startup path', () => {
  const { recoverAgentRunsOnStartup } = require('../index');
  assert.throws(() => recoverAgentRunsOnStartup({
    env: { AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1' },
    store: { reconcileInterruptedRuns() { throw new Error('database secret detail'); } }
  }), error => error.code === 'agent_run_recovery_failed' && !error.message.includes('database secret detail'));
});

test('startServer runs explicit recovery exactly once before accepting traffic', async t => {
  const { startServer, server } = require('../index');
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  const { EventEmitter } = require('node:events');
  let calls = 0;
  const fakeServer = new EventEmitter();
  fakeServer.listen = (_port, callback) => {
    assert.equal(calls, 1, 'recovery must finish before the listener starts');
    fakeServer.listening = true;
    callback();
  };
  fakeServer.address = () => ({ port: 3002 });
  await startServer({
    port: 0,
    env: { NODE_ENV: 'test', AYA_AGENT_RECOVER_INTERRUPTED_RUNS: '1', AINEWS_DISABLE_CRON: '1', AINEWS_SKIP_STARTUP_REFRESH: '1' },
    agentStore: { reconcileInterruptedRuns() { calls++; return 0; } },
    server: fakeServer
  });
  assert.equal(calls, 1);
});

test('single-instance recovery defaults and deployment opt-in are documented', () => {
  const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  const compose = fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8');
  assert.match(envExample, /AYA_AGENT_RECOVER_INTERRUPTED_RUNS=0/);
  assert.match(envExample, /无其他 Agent 执行 worker 的单副本部署/);
  assert.match(envExample, /全体 worker 已 quiesced 的维护启动/);
  assert.match(envExample, /普通\/滚动多副本必须全部保持 0/);
  assert.match(envExample, /没有 per-run lease/);
  assert.match(envExample, /租约实现前不得在多副本启用/);
  assert.match(compose, /AYA_AGENT_RECOVER_INTERRUPTED_RUNS=1/);
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
  assert.equal(enabled.length, 10);
  assert(expressions.includes('*/30 * * * *'));
  assert(expressions.includes('17 */6 * * *'));
  assert(expressions.includes('*/10 * * * *'));
  assert(expressions.includes('43 3 * * *'));
  assert(expressions.includes('7,27,47 * * * *'));
  assert(expressions.includes('* * * * *'));
  enabled.forEach((job) => job.stop());
});

test('creator scheduler flag removes only creator acquisition jobs', () => {
  const { registerCronJobs } = require('../index');
  const expressions = [];
  const cronLib = { schedule: (expression) => { expressions.push(expression); return { stop() {} }; } };
  const jobs = registerCronJobs({
    env: { AYA_DISABLE_CREATOR_SCHEDULER: '1' }, cronLib,
    newsService: { updateAllNews: async () => ({}) },
    signalService: { refreshAll: async () => ({}), store: { purgeOldData: () => ({}) } },
    databaseService: { initialize: async () => {}, cleanOldNews: async () => 0 },
    diversityAuditService: { runDailyAudit: async () => ({ status: 'ok' }) }
  });
  assert.equal(jobs.length, 7);
  assert(!expressions.includes('*/10 * * * *'));
  jobs.forEach((job) => job.stop());
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

test('WebSub renewal cron uses the injected service and subscription transport', async () => {
  const { registerCronJobs } = require('../index');
  const handlers = new Map();
  const calls = [];
  const cronLib = {
    schedule(expression, handler) {
      handlers.set(expression, handler);
      return { stop() {} };
    }
  };
  const youtubeWebSubService = {
    async renewDue({ requestSubscription }) {
      calls.push('renew');
      await requestSubscription({ topic: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_test' });
    },
    async requestSubscription() {
      calls.push('request');
    }
  };
  const jobs = registerCronJobs({
    env: {}, cronLib, youtubeWebSubService,
    newsService: { updateAllNews: async () => ({}) },
    signalService: { refreshAll: async () => ({}), store: { purgeOldData: () => ({}) } },
    databaseService: { initialize: async () => {}, cleanOldNews: async () => 0 },
    diversityAuditService: { runDailyAudit: async () => ({ status: 'ok' }) }
  });
  await handlers.get('17 */6 * * *')();
  jobs.forEach((job) => job.stop());
  assert.deepEqual(calls, ['renew', 'request']);
});
