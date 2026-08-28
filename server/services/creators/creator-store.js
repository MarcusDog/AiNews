const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const METRIC_FIELDS = [
  'views', 'likes', 'comments', 'shares', 'bookmarks', 'platformRank', 'followersAtCapture'
];

function json(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function iso(value, fieldName, nullable = false) {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  const date = new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError(`${fieldName} must be a valid timestamp`);
  return date.toISOString();
}

function boundedText(value, max = 2000, nullable = true) {
  if (value === null || value === undefined || value === '') return nullable ? null : '';
  return String(value).slice(0, max);
}

function bool(value) {
  return value === true || Number(value) === 1;
}

function sameMetric(left, right) {
  return METRIC_FIELDS.every((field) => (left?.[field] ?? null) === (right?.[field] ?? null));
}

class CreatorStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath
      || process.env.AINEWS_DB_PATH
      || path.join(__dirname, '../../data/ainews.db');
    this.db = options.db || null;
    this.initialized = false;
  }

  initialize() {
    if (!this.db) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS creator_verticals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        keywords_json TEXT NOT NULL DEFAULT '[]',
        negative_keywords_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS creators (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        review_status TEXT NOT NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS creator_accounts (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        external_account_id TEXT NOT NULL,
        handle TEXT,
        profile_url TEXT NOT NULL,
        region TEXT NOT NULL,
        source_tier TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_verified_at TEXT,
        auth_state TEXT NOT NULL,
        backfill_state TEXT NOT NULL DEFAULT 'pending',
        oldest_fetched_at TEXT,
        newest_fetched_at TEXT,
        last_reconciled_at TEXT,
        next_cursor TEXT,
        history_limit_reason TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_platform_external
        ON creator_accounts(platform, external_account_id);
      CREATE INDEX IF NOT EXISTS idx_creator_accounts_due
        ON creator_accounts(enabled, next_run_at, id);

      CREATE TABLE IF NOT EXISTS creator_vertical_memberships (
        creator_id TEXT NOT NULL,
        vertical_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(creator_id, vertical_id),
        FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE,
        FOREIGN KEY(vertical_id) REFERENCES creator_verticals(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS creator_posts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        external_post_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT,
        content_type TEXT NOT NULL,
        published_at TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        edited_at TEXT,
        deleted_at TEXT,
        language TEXT,
        source_confidence TEXT NOT NULL,
        provenance_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(account_id) REFERENCES creator_accounts(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_posts_platform_external
        ON creator_posts(platform, external_post_id);
      CREATE INDEX IF NOT EXISTS idx_creator_posts_account_published
        ON creator_posts(account_id, published_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS creator_post_verticals (
        post_id TEXT NOT NULL,
        vertical_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(post_id, vertical_id),
        FOREIGN KEY(post_id) REFERENCES creator_posts(id) ON DELETE CASCADE,
        FOREIGN KEY(vertical_id) REFERENCES creator_verticals(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS creator_post_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        views REAL,
        likes REAL,
        comments REAL,
        shares REAL,
        bookmarks REAL,
        platform_rank REAL,
        followers_at_capture REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(post_id) REFERENCES creator_posts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creator_metrics_post_time
        ON creator_post_metrics(post_id, captured_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS creator_cursors (
        account_id TEXT NOT NULL,
        cursor_kind TEXT NOT NULL,
        cursor TEXT,
        exhausted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(account_id, cursor_kind),
        FOREIGN KEY(account_id) REFERENCES creator_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS creator_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        account_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        received INTEGER NOT NULL DEFAULT 0,
        saved INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(account_id) REFERENCES creator_accounts(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_creator_runs_account_started
        ON creator_runs(account_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS creator_backfills (
        account_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        next_cursor TEXT,
        oldest_fetched_at TEXT,
        newest_fetched_at TEXT,
        last_reconciled_at TEXT,
        history_limit_reason TEXT,
        pages_fetched INTEGER NOT NULL DEFAULT 0,
        items_fetched INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(account_id) REFERENCES creator_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creator_backfills_state
        ON creator_backfills(state, updated_at, account_id);

      CREATE TABLE IF NOT EXISTS creator_topics (
        id TEXT PRIMARY KEY,
        vertical_id TEXT,
        title TEXT NOT NULL,
        summary TEXT,
        first_seen_at TEXT NOT NULL,
        latest_seen_at TEXT NOT NULL,
        hotness REAL,
        formula_version TEXT NOT NULL,
        creator_count INTEGER NOT NULL DEFAULT 0,
        platform_count INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(vertical_id) REFERENCES creator_verticals(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS creator_topic_posts (
        topic_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        adopted_at TEXT NOT NULL,
        PRIMARY KEY(topic_id, post_id),
        FOREIGN KEY(topic_id) REFERENCES creator_topics(id) ON DELETE CASCADE,
        FOREIGN KEY(post_id) REFERENCES creator_posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS creator_topic_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(topic_id) REFERENCES creator_topics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS creator_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        vertical_id TEXT,
        platform TEXT,
        score REAL,
        formula_version TEXT,
        transition_bucket TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_creator_events_seq ON creator_events(seq);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_events_transition
        ON creator_events(event_type, entity_type, entity_id, formula_version, transition_bucket);

      CREATE TABLE IF NOT EXISTS creator_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        filters_json TEXT NOT NULL DEFAULT '{}',
        delivery_mode TEXT NOT NULL,
        quiet_hours_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS creator_delivery_endpoints (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        destination TEXT NOT NULL,
        secret_ref TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS creator_delivery_outbox (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        UNIQUE(event_id, subscription_id, endpoint_id),
        FOREIGN KEY(event_id) REFERENCES creator_events(id) ON DELETE CASCADE,
        FOREIGN KEY(subscription_id) REFERENCES creator_subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY(endpoint_id) REFERENCES creator_delivery_endpoints(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creator_outbox_status_due
        ON creator_delivery_outbox(status, next_attempt_at, id);

      CREATE TABLE IF NOT EXISTS creator_delivery_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outbox_id TEXT NOT NULL,
        attempted_at TEXT NOT NULL,
        status TEXT NOT NULL,
        response_code INTEGER,
        error TEXT,
        FOREIGN KEY(outbox_id) REFERENCES creator_delivery_outbox(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS creator_bridge_nonces (
        source_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY(source_id, nonce)
      );

      CREATE TABLE IF NOT EXISTS creator_bridge_payloads (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        body_sha256 TEXT NOT NULL,
        item_count INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES creator_runs(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_creator_bridge_payloads_expiry
        ON creator_bridge_payloads(expires_at, id);

      CREATE TABLE IF NOT EXISTS creator_bridge_payload_posts (
        payload_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        PRIMARY KEY(payload_id, post_id),
        FOREIGN KEY(payload_id) REFERENCES creator_bridge_payloads(id) ON DELETE CASCADE,
        FOREIGN KEY(post_id) REFERENCES creator_posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS creator_maintenance_previews (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        boundaries_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS creator_maintenance_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preview_id TEXT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        boundaries_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(preview_id) REFERENCES creator_maintenance_previews(id) ON DELETE SET NULL
      );
    `);
    this.initialized = true;
    return this;
  }

  ensureInitialized() {
    if (!this.db) this.initialize();
  }

  syncVerticals(verticals = []) {
    this.ensureInitialized();
    const statement = this.db.prepare(`
      INSERT INTO creator_verticals (
        id, name, version, enabled, keywords_json, negative_keywords_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        enabled = excluded.enabled,
        keywords_json = excluded.keywords_json,
        negative_keywords_json = excluded.negative_keywords_json,
        updated_at = excluded.updated_at
    `);
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        if (!item?.id || !item?.name || !item?.version) throw new TypeError('vertical id/name/version required');
        const createdAt = iso(item.createdAt, 'createdAt');
        statement.run(
          item.id, item.name, item.version, item.enabled === false ? 0 : 1,
          json(item.keywords, []), json(item.negativeKeywords, []), createdAt, createdAt
        );
      }
    });
    transaction(verticals);
  }

  upsertCreators(creators = []) {
    this.ensureInitialized();
    const upsert = this.db.prepare(`
      INSERT INTO creators (id, display_name, kind, review_status, reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        kind = excluded.kind,
        review_status = excluded.review_status,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at
    `);
    const removeMemberships = this.db.prepare(
      'DELETE FROM creator_vertical_memberships WHERE creator_id = ?'
    );
    const addMembership = this.db.prepare(`
      INSERT INTO creator_vertical_memberships (creator_id, vertical_id, created_at)
      VALUES (?, ?, ?)
    `);
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        if (!item?.id || !item?.displayName) throw new TypeError('creator id/displayName required');
        const now = iso(item.reviewedAt || Date.now(), 'reviewedAt');
        upsert.run(
          item.id,
          item.displayName,
          item.kind || 'person',
          item.reviewStatus || 'candidate',
          iso(item.reviewedAt, 'reviewedAt', true),
          now,
          now
        );
        removeMemberships.run(item.id);
        for (const verticalId of item.verticalIds || []) addMembership.run(item.id, verticalId, now);
      }
    });
    transaction(creators);
  }

  upsertAccounts(accounts = []) {
    this.ensureInitialized();
    const byIdentity = this.db.prepare(
      'SELECT id FROM creator_accounts WHERE platform = ? AND external_account_id = ?'
    );
    const byId = this.db.prepare(
      'SELECT platform, external_account_id FROM creator_accounts WHERE id = ?'
    );
    const upsert = this.db.prepare(`
      INSERT INTO creator_accounts (
        id, creator_id, platform, external_account_id, handle, profile_url, region,
        source_tier, enabled, last_verified_at, auth_state, backfill_state,
        oldest_fetched_at, newest_fetched_at, last_reconciled_at, next_cursor,
        history_limit_reason, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        creator_id = excluded.creator_id,
        handle = excluded.handle,
        profile_url = excluded.profile_url,
        region = excluded.region,
        source_tier = excluded.source_tier,
        enabled = excluded.enabled,
        last_verified_at = excluded.last_verified_at,
        auth_state = excluded.auth_state,
        backfill_state = excluded.backfill_state,
        oldest_fetched_at = COALESCE(excluded.oldest_fetched_at, creator_accounts.oldest_fetched_at),
        newest_fetched_at = COALESCE(excluded.newest_fetched_at, creator_accounts.newest_fetched_at),
        last_reconciled_at = COALESCE(excluded.last_reconciled_at, creator_accounts.last_reconciled_at),
        next_cursor = excluded.next_cursor,
        history_limit_reason = excluded.history_limit_reason,
        next_run_at = excluded.next_run_at,
        updated_at = excluded.updated_at
    `);
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        if (!item?.id || !item?.creatorId || !item?.platform || !item?.externalAccountId) {
          throw new TypeError('account id/creatorId/platform/externalAccountId required');
        }
        if (!item.profileUrl) throw new TypeError('account profileUrl required');
        const identity = byIdentity.get(item.platform, item.externalAccountId);
        const stable = byId.get(item.id);
        if ((identity && identity.id !== item.id)
          || (stable && (stable.platform !== item.platform || stable.external_account_id !== item.externalAccountId))) {
          throw new Error('Platform account identity conflict');
        }
        const now = iso(item.lastVerifiedAt || Date.now(), 'lastVerifiedAt');
        upsert.run(
          item.id, item.creatorId, item.platform, item.externalAccountId,
          boundedText(item.handle, 300), item.profileUrl, item.region || 'global',
          item.sourceTier || 'L1', item.enabled ? 1 : 0,
          iso(item.lastVerifiedAt, 'lastVerifiedAt', true), item.authState || 'unconfigured',
          item.backfillState || 'pending',
          iso(item.oldestFetchedAt, 'oldestFetchedAt', true),
          iso(item.newestFetchedAt, 'newestFetchedAt', true),
          iso(item.lastReconciledAt, 'lastReconciledAt', true),
          item.nextCursor ?? null,
          boundedText(item.historyLimitReason, 1000),
          iso(item.nextRunAt, 'nextRunAt', true),
          now,
          now
        );
      }
    });
    transaction(accounts);
  }

  commitPage(page = {}) {
    this.ensureInitialized();
    if (!page.accountId) throw new TypeError('accountId required');
    if (!Array.isArray(page.posts)) throw new TypeError('posts must be an array');
    const account = this.db.prepare('SELECT * FROM creator_accounts WHERE id = ?').get(page.accountId);
    if (!account) throw new Error(`Unknown creator account: ${page.accountId}`);
    const cursorKind = page.cursorKind || 'incremental';
    const collectedAt = iso(page.collectedAt || Date.now(), 'collectedAt');
    const existsById = this.db.prepare('SELECT 1 FROM creator_posts WHERE id = ?');
    const existsByIdentity = this.db.prepare(
      'SELECT id FROM creator_posts WHERE platform = ? AND external_post_id = ?'
    );
    const upsertPost = this.db.prepare(`
      INSERT INTO creator_posts (
        id, account_id, platform, external_post_id, url, title, text, content_type,
        published_at, collected_at, edited_at, deleted_at, language, source_confidence,
        provenance_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        title = excluded.title,
        text = excluded.text,
        content_type = excluded.content_type,
        collected_at = excluded.collected_at,
        edited_at = excluded.edited_at,
        deleted_at = excluded.deleted_at,
        language = excluded.language,
        source_confidence = excluded.source_confidence,
        provenance_url = excluded.provenance_url,
        updated_at = excluded.updated_at
    `);
    const clearVerticals = this.db.prepare('DELETE FROM creator_post_verticals WHERE post_id = ?');
    const addVertical = this.db.prepare(`
      INSERT INTO creator_post_verticals (post_id, vertical_id, created_at) VALUES (?, ?, ?)
    `);
    const latestMetric = this.db.prepare(`
      SELECT views, likes, comments, shares, bookmarks,
             platform_rank AS platformRank, followers_at_capture AS followersAtCapture
      FROM creator_post_metrics WHERE post_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1
    `);
    const insertMetric = this.db.prepare(`
      INSERT INTO creator_post_metrics (
        post_id, captured_at, views, likes, comments, shares, bookmarks,
        platform_rank, followers_at_capture, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertCursor = this.db.prepare(`
      INSERT INTO creator_cursors (account_id, cursor_kind, cursor, exhausted, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_id, cursor_kind) DO UPDATE SET
        cursor = excluded.cursor,
        exhausted = excluded.exhausted,
        updated_at = excluded.updated_at
    `);
    const result = { inserted: 0, updated: 0, snapshots: 0 };
    const transaction = this.db.transaction(() => {
      for (const item of page.posts) {
        if (!item?.id) throw new TypeError('post id required');
        if (!item.externalPostId) throw new TypeError('externalPostId required');
        if ((item.accountId || page.accountId) !== page.accountId) throw new TypeError('post accountId mismatch');
        const platform = item.platform || account.platform;
        if (platform !== account.platform) throw new TypeError('post platform mismatch');
        const identity = existsByIdentity.get(platform, item.externalPostId);
        if (identity && identity.id !== item.id) throw new Error('Platform post identity conflict');
        const wasPresent = Boolean(existsById.get(item.id));
        const itemCollectedAt = iso(item.collectedAt || collectedAt, 'collectedAt');
        upsertPost.run(
          item.id, page.accountId, platform, item.externalPostId, item.url, item.title,
          boundedText(item.text, 20000), item.contentType,
          iso(item.publishedAt, 'publishedAt'), itemCollectedAt,
          iso(item.editedAt, 'editedAt', true), iso(item.deletedAt, 'deletedAt', true),
          boundedText(item.language, 40), item.sourceConfidence, item.provenanceUrl,
          itemCollectedAt, itemCollectedAt
        );
        result[wasPresent ? 'updated' : 'inserted'] += 1;
        clearVerticals.run(item.id);
        for (const verticalId of item.verticalIds || []) addVertical.run(item.id, verticalId, itemCollectedAt);

        if (item.metrics) {
          const normalizedMetric = Object.fromEntries(
            METRIC_FIELDS.map((field) => [field, item.metrics[field] ?? null])
          );
          const previous = latestMetric.get(item.id);
          if (!previous || !sameMetric(previous, normalizedMetric)) {
            insertMetric.run(
              item.id,
              iso(item.metrics.capturedAt || itemCollectedAt, 'metrics.capturedAt'),
              normalizedMetric.views,
              normalizedMetric.likes,
              normalizedMetric.comments,
              normalizedMetric.shares,
              normalizedMetric.bookmarks,
              normalizedMetric.platformRank,
              normalizedMetric.followersAtCapture,
              itemCollectedAt
            );
            result.snapshots += 1;
          }
        }
      }
      upsertCursor.run(
        page.accountId,
        cursorKind,
        page.nextCursor ?? null,
        page.exhausted ? 1 : 0,
        collectedAt
      );
    });
    transaction();
    return result;
  }

  getCursor(accountId, cursorKind = 'incremental') {
    this.ensureInitialized();
    const row = this.db.prepare(
      'SELECT cursor, exhausted, updated_at FROM creator_cursors WHERE account_id = ? AND cursor_kind = ?'
    ).get(accountId, cursorKind);
    return row ? { cursor: row.cursor, exhausted: bool(row.exhausted), updatedAt: row.updated_at } : null;
  }

  listDueAccounts(options = {}) {
    this.ensureInitialized();
    const before = iso(options.before || Date.now(), 'before');
    const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
    return this.db.prepare(`
      SELECT * FROM creator_accounts
      WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
      ORDER BY next_run_at, id LIMIT ?
    `).all(before, limit).map((row) => this.mapAccount(row));
  }

  recordRun(run = {}) {
    this.ensureInitialized();
    if (!run.id || !run.sourceId || !run.status) throw new TypeError('run id/sourceId/status required');
    this.db.prepare(`
      INSERT INTO creator_runs (
        id, source_id, account_id, status, started_at, finished_at,
        received, saved, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        finished_at = excluded.finished_at,
        received = excluded.received,
        saved = excluded.saved,
        error = excluded.error,
        metadata_json = excluded.metadata_json
    `).run(
      run.id, run.sourceId, run.accountId || null, run.status,
      iso(run.startedAt, 'startedAt'), iso(run.finishedAt, 'finishedAt', true),
      Number(run.received || 0), Number(run.saved || 0), boundedText(run.error, 2000),
      json(run.metadata, {})
    );
    return run.id;
  }

  updateBackfill(accountId, update = {}) {
    this.ensureInitialized();
    const state = update.state || 'pending';
    const updatedAt = iso(update.updatedAt || Date.now(), 'updatedAt');
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO creator_backfills (
          account_id, state, next_cursor, oldest_fetched_at, newest_fetched_at,
          last_reconciled_at, history_limit_reason, pages_fetched, items_fetched, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          state = excluded.state,
          next_cursor = excluded.next_cursor,
          oldest_fetched_at = COALESCE(excluded.oldest_fetched_at, creator_backfills.oldest_fetched_at),
          newest_fetched_at = COALESCE(excluded.newest_fetched_at, creator_backfills.newest_fetched_at),
          last_reconciled_at = COALESCE(excluded.last_reconciled_at, creator_backfills.last_reconciled_at),
          history_limit_reason = excluded.history_limit_reason,
          pages_fetched = excluded.pages_fetched,
          items_fetched = excluded.items_fetched,
          updated_at = excluded.updated_at
      `).run(
        accountId, state, update.nextCursor ?? null,
        iso(update.oldestFetchedAt, 'oldestFetchedAt', true),
        iso(update.newestFetchedAt, 'newestFetchedAt', true),
        iso(update.lastReconciledAt, 'lastReconciledAt', true),
        boundedText(update.historyLimitReason, 1000),
        Number(update.pagesFetched || 0), Number(update.itemsFetched || 0), updatedAt
      );
      this.db.prepare(`
        UPDATE creator_accounts SET
          backfill_state = ?, next_cursor = ?,
          oldest_fetched_at = COALESCE(?, oldest_fetched_at),
          newest_fetched_at = COALESCE(?, newest_fetched_at),
          last_reconciled_at = COALESCE(?, last_reconciled_at),
          history_limit_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(
        state, update.nextCursor ?? null,
        iso(update.oldestFetchedAt, 'oldestFetchedAt', true),
        iso(update.newestFetchedAt, 'newestFetchedAt', true),
        iso(update.lastReconciledAt, 'lastReconciledAt', true),
        boundedText(update.historyLimitReason, 1000), updatedAt, accountId
      );
    });
    transaction();
  }

  listPosts(options = {}) {
    this.ensureInitialized();
    const clauses = [];
    const params = [];
    if (options.accountId) {
      clauses.push('account_id = ?');
      params.push(options.accountId);
    }
    if (options.platform) {
      clauses.push('platform = ?');
      params.push(options.platform);
    }
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 500);
    params.push(limit);
    const rows = this.db.prepare(`
      SELECT * FROM creator_posts
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY published_at DESC, id DESC LIMIT ?
    `).all(...params);
    return rows.map((row) => this.mapPost(row));
  }

  getPost(id) {
    this.ensureInitialized();
    const row = this.db.prepare('SELECT * FROM creator_posts WHERE id = ?').get(id);
    return row ? this.mapPost(row) : null;
  }

  mapAccount(row) {
    return {
      id: row.id,
      creatorId: row.creator_id,
      platform: row.platform,
      externalAccountId: row.external_account_id,
      handle: row.handle,
      profileUrl: row.profile_url,
      region: row.region,
      sourceTier: row.source_tier,
      enabled: bool(row.enabled),
      authState: row.auth_state,
      backfillState: row.backfill_state,
      nextRunAt: row.next_run_at
    };
  }

  mapPost(row) {
    const verticalIds = this.db.prepare(
      'SELECT vertical_id FROM creator_post_verticals WHERE post_id = ? ORDER BY vertical_id'
    ).all(row.id).map((item) => item.vertical_id);
    const metric = this.db.prepare(`
      SELECT captured_at, views, likes, comments, shares, bookmarks,
             platform_rank, followers_at_capture
      FROM creator_post_metrics WHERE post_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1
    `).get(row.id);
    return {
      id: row.id,
      accountId: row.account_id,
      platform: row.platform,
      externalPostId: row.external_post_id,
      url: row.url,
      title: row.title,
      text: row.text,
      contentType: row.content_type,
      publishedAt: row.published_at,
      collectedAt: row.collected_at,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      language: row.language,
      verticalIds,
      sourceConfidence: row.source_confidence,
      provenanceUrl: row.provenance_url,
      metrics: metric ? {
        capturedAt: metric.captured_at,
        views: metric.views,
        likes: metric.likes,
        comments: metric.comments,
        shares: metric.shares,
        bookmarks: metric.bookmarks,
        platformRank: metric.platform_rank,
        followersAtCapture: metric.followers_at_capture
      } : null
    };
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
    this.initialized = false;
  }
}

module.exports = CreatorStore;
