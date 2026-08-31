const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SignalStore = require('../services/signals/signal-store');
const { buildSignalSourceCatalog } = require('../config/signalSources');
const { normalizeSignal } = require('../services/signals/signal-normalizer');

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-signal-store-'));
  const store = new SignalStore({ dbPath: path.join(directory, 'signals.db') });
  return {
    directory,
    store,
    close() {
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function githubSignal(overrides = {}) {
  return normalizeSignal({
    externalId: 'repo-1',
    kind: 'repository',
    title: 'Example AI repository',
    url: 'https://github.com/example/ai-repo',
    publishedAt: '2026-08-27T00:00:00.000Z',
    metrics: { stars: 100, forks: 5 },
    repoFullName: 'example/ai-repo',
    raw: { id: 1 },
    ...overrides
  }, {
    id: 'github-recent-ai',
    name: 'GitHub 新兴 AI 项目',
    platform: 'github',
    region: 'global',
    trustClass: 'official'
  }, { now: new Date('2026-08-27T01:00:00.000Z') });
}

test('schema initialization is idempotent and creates all signal/topic tables and indexes', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    fixture.store.initialize(buildSignalSourceCatalog({}));
    const tables = new Set(fixture.store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map((row) => row.name));
    const indexes = new Set(fixture.store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index'"
    ).all().map((row) => row.name));

    for (const table of [
      'signals', 'signal_sources', 'signal_runs', 'topics', 'topic_aliases',
      'topic_signals', 'topic_snapshots', 'topic_changes'
    ]) assert(tables.has(table), table);
    for (const index of [
      'idx_signals_fingerprint', 'idx_signals_published_at', 'idx_signals_platform',
      'idx_topics_anchor', 'idx_topic_changes_seq'
    ]) assert(indexes.has(index), index);
  } finally {
    fixture.close();
  }
});

test('signal upserts are idempotent and refresh metrics without replacing original evidence', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    const original = githubSignal();
    const first = fixture.store.upsertSignals([original]);
    const updated = {
      ...original,
      url: 'https://github.com/attacker/replacement',
      publishedAt: '2026-08-28T00:00:00.000Z',
      region: 'cn',
      lastSeenAt: '2026-08-27T03:00:00.000Z',
      metrics: { ...original.metrics, stars: 240 }
    };
    const second = fixture.store.upsertSignals([updated]);
    const row = fixture.store.db.prepare('SELECT * FROM signals WHERE id = ?').get(original.id);

    assert.deepEqual(first, { inserted: 1, updated: 0 });
    assert.deepEqual(second, { inserted: 0, updated: 1 });
    assert.equal(row.url, original.url);
    assert.equal(row.published_at, original.publishedAt);
    assert.equal(row.region, 'cn');
    assert.equal(row.last_seen_at, '2026-08-27T03:00:00.000Z');
    assert.equal(JSON.parse(row.metrics_json).stars, 240);
  } finally {
    fixture.close();
  }
});

test('failed source run preserves last success while updating health evidence', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    const successRun = fixture.store.startSourceRun('hackernews-ai', '2026-08-27T00:00:00.000Z');
    fixture.store.finishSourceRun(successRun, {
      status: 'success',
      received: 3,
      saved: 2,
      finishedAt: '2026-08-27T00:01:00.000Z'
    });
    const failedRun = fixture.store.startSourceRun('hackernews-ai', '2026-08-27T02:00:00.000Z');
    fixture.store.finishSourceRun(failedRun, {
      status: 'failure',
      error: 'upstream timeout',
      finishedAt: '2026-08-27T02:00:30.000Z'
    });
    const health = fixture.store.listSourceHealth().find((item) => item.id === 'hackernews-ai');

    assert.equal(health.lastSuccessAt, '2026-08-27T00:01:00.000Z');
    assert.equal(health.lastAttemptAt, '2026-08-27T02:00:30.000Z');
    assert.equal(health.lastError, 'upstream timeout');
    assert.equal(health.failureCount, 1);
    assert.equal(health.status, 'degraded');
  } finally {
    fixture.close();
  }
});

test('unconfigured, disabled, pending and online source states stay distinct', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    const runId = fixture.store.startSourceRun('github-recent-ai', '2026-08-27T00:00:00.000Z');
    fixture.store.finishSourceRun(runId, { status: 'success', finishedAt: '2026-08-27T00:00:05.000Z' });
    const health = new Map(fixture.store.listSourceHealth().map((item) => [item.id, item]));

    assert.equal(health.get('github-recent-ai').status, 'online');
    assert.equal(health.get('hackernews-ai').status, 'pending');
    assert.equal(health.get('youtube-search').status, 'unconfigured');
    assert.equal(health.get('mediacrawler-sidecar').status, 'disabled');
  } finally {
    fixture.close();
  }
});

test('topics resolve aliases, retain deterministic order, and expose monotonic changes', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    const signal = githubSignal();
    fixture.store.upsertSignals([signal]);
    fixture.store.replaceTopics({
      refreshId: 'refresh-1',
      generatedAt: '2026-08-27T02:00:00.000Z',
      topics: [{
        id: 'topic-canonical',
        anchor: 'repo:example/ai-repo',
        title: 'Example AI repository',
        summary: 'A real repository signal',
        firstSeenAt: '2026-08-27T00:00:00.000Z',
        latestSeenAt: '2026-08-27T01:00:00.000Z',
        trendScore: 72,
        creatorScore: 68,
        trendDirection: 'new',
        evidenceStrength: 'single-source',
        formulaVersion: 'trend-v1',
        scoreBreakdown: { freshness: 25 },
        opportunity: { formulaVersion: 'opportunity-v1' },
        clusterReasons: ['repo_full_name'],
        signalIds: [signal.id]
      }],
      aliases: [{ aliasId: 'topic-old', canonicalId: 'topic-canonical', reason: 'merge' }]
    });

    const direct = fixture.store.getTopic('topic-canonical');
    const aliased = fixture.store.getTopic('topic-old');
    const listed = fixture.store.listTopics({ windowHours: 72, now: '2026-08-27T03:00:00.000Z' });
    const changes = fixture.store.listChanges({ cursor: 0, limit: 20 });

    assert.equal(direct.id, 'topic-canonical');
    assert.equal(aliased.id, 'topic-canonical');
    assert.equal(aliased.canonicalTopicId, 'topic-canonical');
    assert.deepEqual(listed.map((topic) => topic.id), ['topic-canonical']);
    assert.equal(changes.expired, false);
    assert(changes.items.length >= 1);
    assert.equal(changes.nextCursor, changes.items.at(-1).seq);
  } finally {
    fixture.close();
  }
});

test('expired change cursors return resync metadata after retention removes history', () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize(buildSignalSourceCatalog({}));
    fixture.store.db.prepare(
      "INSERT INTO topic_changes (topic_id, change_type, changed_at, payload_json) VALUES (?, ?, ?, ?)"
    ).run('one', 'new', '2026-07-01T00:00:00.000Z', '{}');
    fixture.store.db.prepare(
      "INSERT INTO topic_changes (topic_id, change_type, changed_at, payload_json) VALUES (?, ?, ?, ?)"
    ).run('two', 'new', '2026-08-27T00:00:00.000Z', '{}');
    fixture.store.db.prepare('DELETE FROM topic_changes WHERE seq = 1').run();

    const result = fixture.store.listChanges({ cursor: 0, limit: 20 });
    assert.equal(result.expired, true);
    assert.equal(result.oldestCursor, 2);
    assert.equal(result.latestCursor, 2);
  } finally {
    fixture.close();
  }
});
