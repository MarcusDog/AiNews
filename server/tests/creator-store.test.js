const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(__dirname, '../services/creators/creator-store.js');
const CreatorStore = fs.existsSync(modulePath) ? require(modulePath) : null;

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-store-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creators.db') });
  store.initialize();
  return {
    directory,
    store,
    close() {
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function verticals() {
  return [
    {
      id: 'ai-tech',
      name: 'AI 科技',
      version: 'vertical-v1',
      enabled: true,
      keywords: ['AI', 'Agent'],
      negativeKeywords: ['游戏 AI'],
      createdAt: '2026-08-28T00:00:00.000Z'
    },
    {
      id: 'beauty',
      name: '美妆',
      version: 'vertical-v1',
      enabled: true,
      keywords: ['护肤'],
      negativeKeywords: ['游戏皮肤'],
      createdAt: '2026-08-28T00:00:00.000Z'
    }
  ];
}

function creator() {
  return {
    id: 'creator-1',
    displayName: 'Creator One',
    kind: 'person',
    reviewStatus: 'verified',
    reviewedAt: '2026-08-28T00:10:00.000Z',
    verticalIds: ['ai-tech', 'beauty']
  };
}

function account(overrides = {}) {
  return {
    id: 'account-youtube-1',
    creatorId: 'creator-1',
    platform: 'youtube',
    externalAccountId: 'UC_creator_1',
    handle: '@creator-one',
    profileUrl: 'https://www.youtube.com/channel/UC_creator_1',
    region: 'global',
    sourceTier: 'L1',
    enabled: true,
    lastVerifiedAt: '2026-08-28T00:10:00.000Z',
    authState: 'not_required',
    backfillState: 'pending',
    nextRunAt: '2026-08-28T01:00:00.000Z',
    ...overrides
  };
}

function post(overrides = {}) {
  return {
    id: 'post-youtube-video-1',
    accountId: 'account-youtube-1',
    platform: 'youtube',
    externalPostId: 'video-1',
    url: 'https://www.youtube.com/watch?v=video-1',
    title: 'A real creator video',
    text: 'Public summary',
    contentType: 'video',
    publishedAt: '2026-08-28T00:30:00.000Z',
    collectedAt: '2026-08-28T00:40:00.000Z',
    editedAt: null,
    deletedAt: null,
    language: 'en',
    verticalIds: ['ai-tech'],
    sourceConfidence: 'public',
    provenanceUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_creator_1',
    metrics: {
      capturedAt: '2026-08-28T00:40:00.000Z',
      views: 100,
      likes: 12,
      comments: null,
      shares: null,
      bookmarks: null,
      platformRank: null,
      followersAtCapture: null
    },
    ...overrides
  };
}

test('CreatorStore module exists', () => {
  assert.equal(typeof CreatorStore, 'function');
});

test('initialization is idempotent and creates the complete creator schema', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.initialize();
    const tables = new Set(fixture.store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map((row) => row.name));
    const indexes = new Set(fixture.store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index'"
    ).all().map((row) => row.name));

    for (const table of [
      'creator_verticals', 'creators', 'creator_accounts', 'creator_vertical_memberships',
      'creator_posts', 'creator_post_verticals', 'creator_post_metrics',
      'creator_post_scores',
      'creator_cursors', 'creator_runs', 'creator_backfills',
      'creator_topics', 'creator_topic_posts', 'creator_topic_snapshots',
      'creator_events', 'creator_subscriptions', 'creator_delivery_endpoints',
      'creator_delivery_outbox', 'creator_delivery_attempts', 'creator_bridge_nonces',
      'creator_bridge_payloads', 'creator_bridge_payload_posts',
      'creator_maintenance_previews', 'creator_maintenance_audits'
    ]) assert(tables.has(table), table);

    for (const index of [
      'idx_creator_accounts_platform_external',
      'idx_creator_posts_platform_external',
      'idx_creator_posts_account_published',
      'idx_creator_metrics_post_time',
      'idx_creator_backfills_state',
      'idx_creator_events_seq',
      'idx_creator_outbox_status_due'
    ]) assert(indexes.has(index), index);

    assert.equal(fixture.store.db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(fixture.store.db.pragma('journal_mode', { simple: true }), 'wal');
  } finally {
    fixture.close();
  }
});

test('vertical, creator and account upserts preserve stable platform identity', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([account()]);

    assert.deepEqual(
      fixture.store.db.prepare(
        'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
      ).all('creator-1').map((row) => row.vertical_id),
      ['ai-tech', 'beauty']
    );
    assert.throws(
      () => fixture.store.upsertAccounts([account({ id: 'different-id' })]),
      /platform account identity/i
    );
    const stored = fixture.store.db.prepare(
      'SELECT id, external_account_id, backfill_state FROM creator_accounts WHERE id = ?'
    ).get('account-youtube-1');
    assert.deepEqual(stored, {
      id: 'account-youtube-1',
      external_account_id: 'UC_creator_1',
      backfill_state: 'pending'
    });
  } finally {
    fixture.close();
  }
});

test('commitPage atomically upserts posts, changed metric snapshots and cursor', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([account()]);

    const first = fixture.store.commitPage({
      accountId: 'account-youtube-1',
      cursorKind: 'incremental',
      posts: [post()],
      nextCursor: 'page-2',
      exhausted: false,
      collectedAt: '2026-08-28T00:40:00.000Z'
    });
    const repeated = fixture.store.commitPage({
      accountId: 'account-youtube-1',
      cursorKind: 'incremental',
      posts: [post({ collectedAt: '2026-08-28T00:45:00.000Z' })],
      nextCursor: 'page-2',
      exhausted: false,
      collectedAt: '2026-08-28T00:45:00.000Z'
    });
    const changed = fixture.store.commitPage({
      accountId: 'account-youtube-1',
      cursorKind: 'incremental',
      posts: [post({
        collectedAt: '2026-08-28T01:00:00.000Z',
        metrics: { ...post().metrics, capturedAt: '2026-08-28T01:00:00.000Z', views: 180 }
      })],
      nextCursor: null,
      exhausted: true,
      collectedAt: '2026-08-28T01:00:00.000Z'
    });

    assert.deepEqual(first, { inserted: 1, updated: 0, snapshots: 1 });
    assert.deepEqual(repeated, { inserted: 0, updated: 1, snapshots: 0 });
    assert.deepEqual(changed, { inserted: 0, updated: 1, snapshots: 1 });
    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count, 1);
    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_post_metrics').get().count, 2);
    assert.deepEqual(fixture.store.getCursor('account-youtube-1', 'incremental'), {
      cursor: null,
      exhausted: true,
      updatedAt: '2026-08-28T01:00:00.000Z'
    });
    const latestMetric = fixture.store.db.prepare(
      'SELECT views, comments FROM creator_post_metrics ORDER BY captured_at DESC LIMIT 1'
    ).get();
    assert.deepEqual(latestMetric, { views: 180, comments: null });
  } finally {
    fixture.close();
  }
});

test('a failed page rolls back every post and does not advance the cursor', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([account()]);

    assert.throws(() => fixture.store.commitPage({
      accountId: 'account-youtube-1',
      cursorKind: 'backfill',
      posts: [post(), post({ id: 'bad-post', externalPostId: null })],
      nextCursor: 'unsafe-next',
      exhausted: false,
      collectedAt: '2026-08-28T00:40:00.000Z'
    }), /externalPostId/);

    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count, 0);
    assert.equal(fixture.store.getCursor('account-youtube-1', 'backfill'), null);
  } finally {
    fixture.close();
  }
});

test('runs, due accounts and backfill state are queryable after restart-safe updates', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([
      account(),
      account({
        id: 'account-youtube-2',
        externalAccountId: 'UC_creator_2',
        profileUrl: 'https://www.youtube.com/channel/UC_creator_2',
        nextRunAt: '2026-08-28T03:00:00.000Z'
      })
    ]);
    fixture.store.recordRun({
      id: 'run-1',
      sourceId: 'youtube-public',
      accountId: 'account-youtube-1',
      status: 'success',
      startedAt: '2026-08-28T00:00:00.000Z',
      finishedAt: '2026-08-28T00:01:00.000Z',
      received: 10,
      saved: 9
    });
    fixture.store.updateBackfill('account-youtube-1', {
      state: 'running',
      nextCursor: 'history-2',
      oldestFetchedAt: '2026-07-01T00:00:00.000Z',
      newestFetchedAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:02:00.000Z'
    });

    assert.deepEqual(
      fixture.store.listDueAccounts({ before: '2026-08-28T02:00:00.000Z', limit: 10 }).map((item) => item.id),
      ['account-youtube-1']
    );
    assert.deepEqual(fixture.store.db.prepare(
      'SELECT status, received, saved FROM creator_runs WHERE id = ?'
    ).get('run-1'), { status: 'success', received: 10, saved: 9 });
    assert.deepEqual(fixture.store.db.prepare(
      'SELECT state, next_cursor, oldest_fetched_at FROM creator_backfills WHERE account_id = ?'
    ).get('account-youtube-1'), {
      state: 'running',
      next_cursor: 'history-2',
      oldest_fetched_at: '2026-07-01T00:00:00.000Z'
    });
  } finally {
    fixture.close();
  }
});

test('listPosts and getPost expose normalized records without inventing metrics', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([account()]);
    fixture.store.commitPage({
      accountId: 'account-youtube-1',
      posts: [post()],
      nextCursor: null,
      exhausted: true,
      collectedAt: '2026-08-28T00:40:00.000Z'
    });

    const listed = fixture.store.listPosts({ accountId: 'account-youtube-1', limit: 10 });
    const direct = fixture.store.getPost('post-youtube-video-1');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, direct.id);
    assert.equal(direct.externalPostId, 'video-1');
    assert.equal(direct.metrics.comments, null);
    assert.deepEqual(direct.verticalIds, ['ai-tech']);
  } finally {
    fixture.close();
  }
});

test('deleting a bridge payload cascades links but preserves runs and posts', { skip: !CreatorStore }, () => {
  const fixture = temporaryStore();
  try {
    fixture.store.syncVerticals(verticals());
    fixture.store.upsertCreators([creator()]);
    fixture.store.upsertAccounts([account()]);
    fixture.store.recordRun({
      id: 'run-bridge', sourceId: 'xhs-sidecar', accountId: 'account-youtube-1',
      status: 'success', startedAt: '2026-08-28T00:00:00.000Z', finishedAt: '2026-08-28T00:01:00.000Z'
    });
    fixture.store.commitPage({
      accountId: 'account-youtube-1', posts: [post()], nextCursor: null, exhausted: true,
      collectedAt: '2026-08-28T00:40:00.000Z'
    });
    fixture.store.db.prepare(`
      INSERT INTO creator_bridge_payloads
        (id, source_id, run_id, received_at, expires_at, body_sha256, item_count, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'payload-1', 'xhs-sidecar', 'run-bridge', '2026-08-28T00:01:00.000Z',
      '2026-09-27T00:01:00.000Z', 'abc', 1, '{"posts":[]}'
    );
    fixture.store.db.prepare(
      'INSERT INTO creator_bridge_payload_posts (payload_id, post_id) VALUES (?, ?)'
    ).run('payload-1', 'post-youtube-video-1');

    fixture.store.db.prepare('DELETE FROM creator_bridge_payloads WHERE id = ?').run('payload-1');
    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payload_posts').get().count, 0);
    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count, 1);
    assert.equal(fixture.store.db.prepare('SELECT COUNT(*) AS count FROM creator_runs').get().count, 1);
  } finally {
    fixture.close();
  }
});
