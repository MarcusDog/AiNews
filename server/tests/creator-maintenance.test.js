const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const CreatorStore = require('../services/creators/creator-store');
const CreatorMaintenance = require('../services/creators/creator-maintenance');

const NOW = '2026-08-29T12:00:00.000Z';

function isoDaysAgo(days) {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-maintenance-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  const backupDir = path.join(directory, 'backups');
  const exportDir = path.join(directory, 'exports');
  const service = new CreatorMaintenance({
    store, backupDir, exportDir, now: () => NOW, tokenTtlMs: 60_000,
    afterExportRecord: options.afterExportRecord
  });
  store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'vertical-v1', createdAt: NOW }]);
  store.upsertCreators([{
    id: 'creator-a', displayName: 'Creator A', kind: 'person', reviewStatus: 'verified',
    reviewedAt: NOW, verticalIds: ['ai-tech']
  }]);
  store.upsertAccounts([{
    id: 'account-a', creatorId: 'creator-a', platform: 'github', externalAccountId: 'org-a',
    profileUrl: 'https://github.com/org-a', region: 'global', sourceTier: 'L1', enabled: true,
    authState: 'not_required', backfillState: 'complete', nextCursor: 'private-cursor', nextRunAt: NOW
  }]);
  return {
    directory, store, service, backupDir, exportDir,
    close() { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

function seedBridgePayload(item, id, receivedAt, postId = 'post-recent') {
  item.store.commitPage({
    accountId: 'account-a', exhausted: true, collectedAt: NOW,
    posts: [{
      id: postId, accountId: 'account-a', platform: 'github', externalPostId: postId,
      url: `https://github.com/org-a/${postId}`, title: `Post ${postId}`, text: 'public content',
      contentType: 'post', publishedAt: isoDaysAgo(5), collectedAt: NOW, language: 'en',
      verticalIds: ['ai-tech'], sourceConfidence: 'official', provenanceUrl: 'https://api.github.com/orgs/org-a/events'
    }]
  });
  const runId = `run-${id}`;
  item.store.db.prepare(`
    INSERT INTO creator_runs (id, source_id, account_id, status, started_at, finished_at, received, saved, metadata_json)
    VALUES (?, 'bridge', 'account-a', 'success', ?, ?, 1, 1, '{}')
  `).run(runId, receivedAt, receivedAt);
  item.store.db.prepare(`
    INSERT INTO creator_bridge_payloads (id, source_id, run_id, received_at, expires_at, body_sha256, item_count, payload_json)
    VALUES (?, 'bridge', ?, ?, ?, ?, 1, ?)
  `).run(id, runId, receivedAt, isoDaysAgo(-1), 'a'.repeat(64), JSON.stringify({ items: [{ title: 'public' }] }));
  item.store.db.prepare('INSERT INTO creator_bridge_payload_posts (payload_id, post_id) VALUES (?, ?)').run(id, postId);
  return { runId, postId };
}

test('cleanup preview freezes exact row/time boundaries and execute cascades bridge links but preserves runs and posts', () => {
  const item = fixture();
  try {
    const old = seedBridgePayload(item, 'payload-old', isoDaysAgo(31));
    seedBridgePayload(item, 'payload-new', isoDaysAgo(29), 'post-new');
    const preview = item.service.previewCleanup('operator-a');
    assert.equal(preview.candidates.bridgePayloads.count, 1);
    assert.equal(preview.candidates.bridgePayloadLinks.count, 1);
    assert.equal(preview.candidates.bridgePayloads.oldestAt, isoDaysAgo(31));
    assert.equal(preview.candidates.bridgePayloads.latestAt, isoDaysAgo(31));
    assert.equal(item.store.db.prepare("SELECT COUNT(*) AS count FROM creator_maintenance_audits WHERE action='cleanup-preview' AND status='success'").get().count, 1);

    seedBridgePayload(item, 'payload-late-arrival', isoDaysAgo(40), 'post-late');
    const result = item.service.executeCleanup('operator-a', preview.token);
    assert.equal(result.deleted.bridgePayloads, 1);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payload_posts WHERE payload_id = ?').get('payload-old').count, 0);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payloads WHERE id = ?').get('payload-late-arrival').count, 1);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts WHERE id = ?').get(old.postId).count, 1);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_runs WHERE id = ?').get(old.runId).count, 1);
    assert.throws(() => item.service.executeCleanup('operator-a', preview.token), /maintenance_preview_used/);
  } finally { item.close(); }
});

test('cleanup enforces every retention window without deleting retained or referenced data', () => {
  const item = fixture();
  try {
    const recent = seedBridgePayload(item, 'payload-retained', isoDaysAgo(5), 'post-retained');
    item.store.db.prepare('UPDATE creator_posts SET published_at = ? WHERE id = ?').run(isoDaysAgo(366), recent.postId);
    item.store.db.prepare(`INSERT INTO creator_post_metrics (post_id, captured_at, views, created_at) VALUES (?, ?, 1, ?)`)
      .run(recent.postId, isoDaysAgo(181), isoDaysAgo(181));
    item.store.db.prepare(`INSERT INTO creator_topics (id, vertical_id, title, first_seen_at, latest_seen_at, hotness, formula_version, creator_count, platform_count, payload_json, created_at, updated_at) VALUES ('topic-maint', 'ai-tech', 'Maintenance topic', ?, ?, 1, 'creator-topic-v1', 1, 1, '{}', ?, ?)`)
      .run(isoDaysAgo(181), NOW, NOW, NOW);
    item.store.db.prepare(`INSERT INTO creator_topic_snapshots (topic_id, captured_at, payload_json) VALUES ('topic-maint', ?, '{}')`)
      .run(isoDaysAgo(181));
    for (const [id, status, age] of [['outbox-ok', 'delivered', 31], ['outbox-dead', 'dead', 91]]) {
      const eventId = `event-${id}`;
      item.store.appendCreatorEvent({ id: eventId, eventType: 'post.hot', entityType: 'post', entityId: recent.postId, transitionBucket: eventId, occurredAt: isoDaysAgo(age), payload: {} });
      item.store.db.prepare(`INSERT OR IGNORE INTO creator_subscriptions (id,user_id,name,filters_json,delivery_mode,quiet_hours_json,enabled,created_at,updated_at) VALUES ('sub-maint','user-a','maint','{}','immediate','{}',1,?,?)`).run(NOW, NOW);
      item.store.db.prepare(`INSERT OR IGNORE INTO creator_delivery_endpoints (id,user_id,type,destination,enabled,created_at,updated_at) VALUES ('endpoint-maint','user-a','test','test://maint',1,?,?)`).run(NOW, NOW);
      item.store.db.prepare(`INSERT INTO creator_delivery_outbox (id,event_id,subscription_id,endpoint_id,status,attempt_count,next_attempt_at,created_at,delivered_at) VALUES (?,?,?,?,?,1,?,?,?)`)
        .run(id, eventId, 'sub-maint', 'endpoint-maint', status, isoDaysAgo(age), isoDaysAgo(age), status === 'delivered' ? isoDaysAgo(age) : null);
    }
    item.store.appendCreatorEvent({ id: 'event-unreferenced-old', eventType: 'post.hot', entityType: 'post', entityId: 'none', transitionBucket: 'old', occurredAt: isoDaysAgo(31), payload: {} });
    const preview = item.service.previewCleanup('operator-a');
    assert.equal(preview.candidates.posts.count, 1);
    assert.equal(preview.candidates.metrics.count, 1);
    assert.equal(preview.candidates.topicSnapshots.count, 1);
    assert.equal(preview.candidates.deliveredOutbox.count, 1);
    assert.equal(preview.candidates.failedOutbox.count, 1);
    assert.equal(preview.candidates.events.count, 1);
    const result = item.service.executeCleanup('operator-a', preview.token);
    assert.equal(result.deleted.posts, 1);
    assert.equal(result.deleted.metrics, 0, 'post cascade removes its metric before explicit metric cleanup');
    assert.equal(result.deleted.topicSnapshots, 1);
    assert.equal(result.deleted.deliveredOutbox, 1);
    assert.equal(result.deleted.failedOutbox, 1);
    assert.equal(result.deleted.events, 1);
    assert.equal(item.store.db.prepare('SELECT COUNT(*) AS count FROM creator_bridge_payloads WHERE id = ?').get('payload-retained').count, 1);
  } finally { item.close(); }
});

test('snapshot cleanup keeps 72-hour detail then one latest row per entity/day through 180 days', () => {
  const item = fixture();
  try {
    seedBridgePayload(item, 'payload-snapshot', isoDaysAgo(1), 'post-snapshot');
    item.store.db.prepare(`INSERT INTO creator_topics (id, vertical_id, title, first_seen_at, latest_seen_at, hotness, formula_version, creator_count, platform_count, payload_json, created_at, updated_at) VALUES ('topic-snapshot', 'ai-tech', 'Snapshot topic', ?, ?, 1, 'creator-topic-v1', 1, 1, '{}', ?, ?)`)
      .run(isoDaysAgo(10), NOW, NOW, NOW);
    const metricInsert = item.store.db.prepare(`INSERT INTO creator_post_metrics (post_id, captured_at, views, created_at) VALUES ('post-snapshot', ?, ?, ?)`);
    const topicInsert = item.store.db.prepare(`INSERT INTO creator_topic_snapshots (topic_id, captured_at, payload_json) VALUES ('topic-snapshot', ?, ?)`);
    for (const [timestamp, value] of [
      ['2026-08-28T10:00:00.000Z', 1], ['2026-08-28T11:00:00.000Z', 2],
      ['2026-08-20T10:00:00.000Z', 3], ['2026-08-20T11:00:00.000Z', 4],
      ['2026-08-19T11:00:00.000Z', 5]
    ]) {
      metricInsert.run(timestamp, value, timestamp);
      topicInsert.run(timestamp, JSON.stringify({ value }));
    }
    const preview = item.service.previewCleanup('operator-a');
    assert.equal(preview.candidates.metrics.count, 1);
    assert.equal(preview.candidates.topicSnapshots.count, 1);
    const result = item.service.executeCleanup('operator-a', preview.token);
    assert.equal(result.deleted.metrics, 1);
    assert.equal(result.deleted.topicSnapshots, 1);
    assert.deepEqual(item.store.db.prepare(`SELECT captured_at FROM creator_post_metrics WHERE post_id='post-snapshot' ORDER BY captured_at`).all().map((row) => row.captured_at), [
      '2026-08-19T11:00:00.000Z', '2026-08-20T11:00:00.000Z',
      '2026-08-28T10:00:00.000Z', '2026-08-28T11:00:00.000Z'
    ]);
  } finally { item.close(); }
});

test('missing, expired and actor-mismatched tokens are rejected and every attempt is redacted and audited', () => {
  const item = fixture();
  try {
    assert.throws(() => item.service.executeCleanup('operator-a', ''), /maintenance_preview_required/);
    const preview = item.service.previewCleanup('operator-a');
    assert.throws(() => item.service.executeCleanup('operator-b', preview.token), /maintenance_preview_mismatch/);
    const tokenHash = item.service.hashToken(preview.token);
    item.store.db.prepare('UPDATE creator_maintenance_previews SET expires_at = ? WHERE id = ?').run(isoDaysAgo(1), tokenHash);
    assert.throws(() => item.service.executeCleanup('operator-a', preview.token), /maintenance_preview_expired/);
    const audits = item.store.db.prepare('SELECT status, boundaries_json, result_json FROM creator_maintenance_audits ORDER BY id').all();
    assert.deepEqual(audits.map((row) => row.status), ['rejected', 'success', 'rejected', 'rejected']);
    assert.equal(JSON.stringify(audits).includes(preview.token), false);
    assert.equal(JSON.stringify(audits).includes('secret'), false);
  } finally { item.close(); }
});

test('online backup stays inside its configured directory and restores with integrity_check ok', async () => {
  const item = fixture();
  try {
    seedBridgePayload(item, 'payload-backup', isoDaysAgo(1), 'post-backup');
    await assert.rejects(item.service.backup('operator-a', { fileName: '../escape.db' }), /maintenance_path_forbidden/);
    const backupPromise = item.service.backup('operator-a', { fileName: 'creator-backup.db' });
    item.store.appendCreatorEvent({ id: 'event-during-backup', eventType: 'post.hot', entityType: 'post', entityId: 'post-backup', transitionBucket: 'backup', occurredAt: NOW, payload: {} });
    const result = await backupPromise;
    assert.equal(result.integrity, 'ok');
    assert.equal(path.dirname(result.path), item.backupDir);
    const restored = new Database(result.path, { readonly: true, fileMustExist: true });
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(restored.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count >= 1, true);
    restored.close();
  } finally { item.close(); }
});

test('backup refuses an existing file without deleting or replacing it', async () => {
  const item = fixture();
  try {
    fs.mkdirSync(item.backupDir, { recursive: true });
    const existing = path.join(item.backupDir, 'existing.db');
    fs.writeFileSync(existing, 'keep-this-backup');
    await assert.rejects(item.service.backup('operator-a', { fileName: 'existing.db' }), /maintenance_file_exists/);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'keep-this-backup');
  } finally { item.close(); }
});

test('JSONL export is consistent, checksummed, path-confined and excludes secrets, cursors and raw headers', () => {
  const item = fixture();
  try {
    seedBridgePayload(item, 'payload-export', isoDaysAgo(1), 'post-export');
    item.store.db.prepare("UPDATE creator_accounts SET next_cursor='secret-cursor' WHERE id='account-a'").run();
    item.store.db.prepare(`INSERT INTO creator_delivery_endpoints (id,user_id,type,destination,secret_ref,enabled,created_at,updated_at) VALUES ('secret-endpoint','user-a','webhook','https://example.com/hook','env:AYA_CREATOR_WEBHOOK_DEFAULT_SECRET',1,?,?)`).run(NOW, NOW);
    assert.throws(() => item.service.exportJsonl('operator-a', { fileName: '/tmp/escape.jsonl' }), /maintenance_path_forbidden/);
    const result = item.service.exportJsonl('operator-a', { fileName: 'creator-export.jsonl' });
    const text = fs.readFileSync(result.path, 'utf8');
    const rows = text.trim().split('\n').map(JSON.parse);
    assert.equal(rows[0].type, 'manifest');
    assert.equal(rows[0].schemaVersion, 'aya-creator-export-v1');
    assert.equal(rows.at(-1).type, 'checksum');
    assert.match(rows.at(-1).sha256, /^[a-f0-9]{64}$/);
    assert.equal(text.includes('secret-cursor'), false);
    assert.equal(text.includes('AYA_CREATOR_WEBHOOK_DEFAULT_SECRET'), false);
    assert.equal(text.toLowerCase().includes('authorization'), false);
    assert.equal(text.toLowerCase().includes('cookie'), false);
    assert(rows.some((row) => row.type === 'post' && row.data.id === 'post-export'));
  } finally { item.close(); }
});

test('interrupted JSONL export removes temporary files and records a failed audit', () => {
  let records = 0;
  const item = fixture({ afterExportRecord: () => { if (++records === 2) throw new Error('simulated_interrupt'); } });
  try {
    assert.throws(() => item.service.exportJsonl('operator-a', { fileName: 'broken.jsonl' }), /simulated_interrupt/);
    assert.deepEqual(fs.existsSync(item.exportDir) ? fs.readdirSync(item.exportDir) : [], []);
    const audit = item.store.db.prepare("SELECT status, result_json FROM creator_maintenance_audits WHERE action='export' ORDER BY id DESC LIMIT 1").get();
    assert.equal(audit.status, 'failed');
    assert.equal(audit.result_json.includes('simulated_interrupt'), true);
  } finally { item.close(); }
});
