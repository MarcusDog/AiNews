const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SignalStore = require('../services/signals/signal-store');
const SignalCollector = require('../services/signals/signal-collector');

function source(id, overrides = {}) {
  return {
    id,
    name: id,
    tier: 'L1',
    platform: id,
    region: 'global',
    mode: 'api',
    adapter: id,
    trustClass: 'community_api',
    timeoutMs: 2500,
    configured: true,
    enabled: true,
    schedulable: true,
    ...overrides
  };
}

function rawSignal(id, overrides = {}) {
  return {
    externalId: id,
    kind: 'discussion',
    title: `AI signal ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-27T00:00:00.000Z',
    metrics: { likes: 2 },
    raw: { id },
    ...overrides
  };
}

function fixture(catalog) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-signal-collector-'));
  const store = new SignalStore({ dbPath: path.join(directory, 'signals.db') });
  store.initialize(catalog);
  return {
    store,
    close() {
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test('collector limits concurrency, preserves catalog order, normalizes and deduplicates signals', async () => {
  const catalog = [source('one'), source('two'), source('three')];
  const state = fixture(catalog);
  let active = 0;
  let peak = 0;
  const adapters = Object.fromEntries(catalog.map((item) => [item.adapter, {
    async collect(receivedSource, options) {
      assert.equal(receivedSource.timeoutMs, 2500);
      assert.equal(options.limit, 7);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, item.id === 'two' ? 5 : 15));
      active -= 1;
      return [rawSignal(item.id), rawSignal(item.id)];
    }
  }]));

  try {
    const collector = new SignalCollector({
      catalog,
      store: state.store,
      adapters,
      concurrency: 2,
      now: () => new Date('2026-08-27T01:00:00.000Z')
    });
    const result = await collector.collectAll({ itemLimit: 7 });

    assert.equal(peak, 2);
    assert.deepEqual(result.sources.map((item) => item.id), ['one', 'two', 'three']);
    assert.equal(result.received, 6);
    assert.equal(result.saved, 3);
    assert.equal(result.skipped, 3);
    assert.deepEqual(result.errors, []);
    assert.equal(state.store.listRecentSignals({ now: '2026-08-27T02:00:00.000Z' }).length, 3);
  } finally {
    state.close();
  }
});

test('one failing source does not block successful persistence and keeps its last success', async () => {
  const catalog = [source('healthy'), source('flaky')];
  const state = fixture(catalog);
  const previous = state.store.startSourceRun('flaky', '2026-08-27T00:00:00.000Z');
  state.store.finishSourceRun(previous, {
    status: 'success',
    received: 1,
    saved: 1,
    finishedAt: '2026-08-27T00:01:00.000Z'
  });

  try {
    const collector = new SignalCollector({
      catalog,
      store: state.store,
      adapters: {
        healthy: { collect: async () => [rawSignal('healthy')] },
        flaky: { collect: async () => { throw new Error('upstream timeout'); } }
      },
      now: () => new Date('2026-08-27T02:00:00.000Z')
    });
    const result = await collector.collectAll();
    const health = new Map(state.store.listSourceHealth().map((item) => [item.id, item]));

    assert.equal(result.saved, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].sourceId, 'flaky');
    assert.equal(result.sources.find((item) => item.id === 'healthy').status, 'success');
    assert.equal(result.sources.find((item) => item.id === 'flaky').status, 'failure');
    assert.equal(health.get('flaky').lastSuccessAt, '2026-08-27T00:01:00.000Z');
    assert.equal(health.get('flaky').lastAttemptAt, '2026-08-27T02:00:00.000Z');
    assert.equal(health.get('flaky').lastError, 'upstream timeout');
    assert.equal(health.get('flaky').failureCount, 1);
    assert.equal(health.get('flaky').status, 'degraded');
  } finally {
    state.close();
  }
});

test('disabled, unconfigured and unschedulable sources are skipped without network calls', async () => {
  const catalog = [
    source('disabled', { enabled: false }),
    source('unconfigured', { configured: false }),
    source('sidecar', { schedulable: false })
  ];
  const state = fixture(catalog);
  let calls = 0;
  const adapters = Object.fromEntries(catalog.map((item) => [item.adapter, {
    collect: async () => { calls += 1; return []; }
  }]));

  try {
    const collector = new SignalCollector({ catalog, store: state.store, adapters });
    const result = await collector.collectAll();

    assert.equal(calls, 0);
    assert.equal(result.sources.length, 3);
    assert.deepEqual(result.sources.map((item) => item.status), ['skipped', 'skipped', 'skipped']);
    assert.deepEqual(result.sources.map((item) => item.reason), ['disabled', 'unconfigured', 'unschedulable']);
  } finally {
    state.close();
  }
});

test('invalid adapter items are isolated while valid items are persisted', async () => {
  const catalog = [source('mixed')];
  const state = fixture(catalog);
  try {
    const collector = new SignalCollector({
      catalog,
      store: state.store,
      adapters: {
        mixed: { collect: async () => [rawSignal('valid'), { title: '', url: 'javascript:bad' }] }
      },
      now: () => new Date('2026-08-27T01:00:00.000Z')
    });
    const result = await collector.collectAll();

    assert.equal(result.sources[0].status, 'success');
    assert.equal(result.sources[0].invalid, 1);
    assert.equal(result.received, 2);
    assert.equal(result.saved, 1);
    assert.equal(result.skipped, 1);
  } finally {
    state.close();
  }
});

test('collector lock rejects overlapping refreshes and releases after completion', async () => {
  const catalog = [source('slow')];
  const state = fixture(catalog);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  try {
    const collector = new SignalCollector({
      catalog,
      store: state.store,
      adapters: { slow: { collect: async () => { await gate; return [rawSignal('slow')]; } } }
    });
    const first = collector.collectAll();
    const overlapping = await collector.collectAll();
    assert.equal(overlapping.status, 'skipped');
    assert.equal(overlapping.reason, 'refresh_in_progress');

    release();
    const completed = await first;
    assert.equal(completed.status, 'success');
    const next = await collector.collectAll();
    assert.equal(next.status, 'success');
  } finally {
    state.close();
  }
});

test('collector accepts structured adapter results and records adapter-declared failure', async () => {
  const catalog = [source('bridge')];
  const state = fixture(catalog);
  try {
    const collector = new SignalCollector({
      catalog,
      store: state.store,
      adapters: {
        bridge: {
          collect: async () => ({ status: 'failure', items: [], errors: [{ error: 'all bridges failed' }] })
        }
      }
    });
    const result = await collector.collectAll();
    assert.equal(result.sources[0].status, 'failure');
    assert.match(result.errors[0].error, /all bridges failed/);
  } finally {
    state.close();
  }
});

test('service refreshes legacy News before importing signals and still collects after legacy failure', async () => {
  const SignalService = require('../services/signals/signal-service');
  const calls = [];
  const collector = {
    async collectAll(options) {
      calls.push(['collect', options]);
      return { status: 'success', sources: [], received: 0, saved: 0, skipped: 0, errors: [] };
    }
  };
  const service = new SignalService({
    catalog: [],
    store: { initialize: () => {}, listSourceHealth: () => [], listRecentSignals: () => [] },
    collector,
    newsService: {
      async updateAllNews() {
        calls.push(['news']);
        throw new Error('one RSS source failed');
      }
    }
  });

  const result = await service.refreshSignals({ refreshLegacy: true, itemLimit: 9 });

  assert.deepEqual(calls, [['news'], ['collect', { itemLimit: 9, sourceLimit: undefined }]]);
  assert.equal(result.legacyRefresh.status, 'failure');
  assert.match(result.legacyRefresh.error, /one RSS source failed/);
  assert.equal(result.status, 'success');
});
