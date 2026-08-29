const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

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

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify({ v: 1, ...value }), 'utf8').toString('base64url');
}

function decodeCursor(value, expectedHash) {
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
  } catch {
    const error = new TypeError('invalid_cursor');
    error.code = 'invalid_cursor';
    throw error;
  }
  if (parsed?.v !== 1 || parsed.h !== expectedHash || !Array.isArray(parsed.sort)) {
    const error = new TypeError('cursor_mismatch');
    error.code = 'cursor_mismatch';
    throw error;
  }
  return parsed;
}

function normalizeSearch(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || [...normalized].length > 200) {
    const error = new TypeError('invalid_query');
    error.code = 'invalid_query';
    throw error;
  }
  return normalized;
}

function expandCjk(value) {
  const normalized = String(value || '').normalize('NFKC');
  const characters = normalized.match(/[\u3400-\u9fff]/g) || [];
  return characters.length ? `${normalized} ${characters.join(' ')}` : normalized;
}

function literalFtsQuery(value) {
  const normalized = normalizeSearch(value);
  const rawTokens = normalized.match(/[\p{L}\p{N}_-]+/gu) || [];
  const tokens = rawTokens.flatMap((token) => (
    /[\u3400-\u9fff]/.test(token) ? (token.match(/[\u3400-\u9fff]/g) || []) : [token]
  ));
  if (!tokens.length) return '"__aya_no_literal_match__"';
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' AND ');
}

function safeHttps(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function publicEventPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = {};
  for (const key of ['title', 'summary', 'reason', 'topicId', 'postId', 'creatorId', 'window']) {
    if (typeof value[key] === 'string') allowed[key] = boundedText(value[key], 1000, false);
  }
  for (const key of ['previousScore', 'currentScore']) {
    if (Number.isFinite(Number(value[key]))) allowed[key] = Number(value[key]);
  }
  if (Array.isArray(value.evidenceUrls)) {
    allowed.evidenceUrls = value.evidenceUrls.map(safeHttps).filter(Boolean).slice(0, 20);
  }
  return allowed;
}

class CreatorStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath
      || process.env.AINEWS_DB_PATH
      || path.join(__dirname, '../../data/ainews.db');
    this.db = options.db || null;
    this.initialized = false;
    this.creatorEvents = new EventEmitter();
    this.creatorEvents.setMaxListeners(0);
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

      CREATE VIRTUAL TABLE IF NOT EXISTS creator_posts_fts USING fts5(
        post_id UNINDEXED,
        title,
        text,
        tokenize = 'unicode61 remove_diacritics 2'
      );

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

      CREATE TABLE IF NOT EXISTS creator_post_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        formula_version TEXT NOT NULL,
        score REAL NOT NULL,
        unrounded_score REAL NOT NULL,
        confidence TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        components_json TEXT NOT NULL,
        penalties_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(post_id) REFERENCES creator_posts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creator_scores_post_time
        ON creator_post_scores(post_id, captured_at DESC, id DESC);

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

      CREATE TABLE IF NOT EXISTS creator_subscription_endpoints (
        subscription_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(subscription_id, endpoint_id),
        FOREIGN KEY(subscription_id) REFERENCES creator_subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY(endpoint_id) REFERENCES creator_delivery_endpoints(id) ON DELETE CASCADE
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
    const indexedPost = this.db.prepare('SELECT 1 FROM creator_posts_fts WHERE post_id = ?');
    const insertIndexedPost = this.db.prepare(
      'INSERT INTO creator_posts_fts (post_id, title, text) VALUES (?, ?, ?)'
    );
    const indexMissingPosts = this.db.transaction(() => {
      for (const row of this.db.prepare('SELECT id, title, text FROM creator_posts').iterate()) {
        if (!indexedPost.get(row.id)) {
          insertIndexedPost.run(row.id, expandCjk(row.title), expandCjk(row.text));
        }
      }
    });
    indexMissingPosts();
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
        backfill_state = CASE
          WHEN creator_accounts.backfill_state IN ('running', 'reconciling', 'complete', 'partial', 'blocked')
            THEN creator_accounts.backfill_state
          ELSE excluded.backfill_state
        END,
        oldest_fetched_at = COALESCE(excluded.oldest_fetched_at, creator_accounts.oldest_fetched_at),
        newest_fetched_at = COALESCE(excluded.newest_fetched_at, creator_accounts.newest_fetched_at),
        last_reconciled_at = COALESCE(excluded.last_reconciled_at, creator_accounts.last_reconciled_at),
        next_cursor = COALESCE(excluded.next_cursor, creator_accounts.next_cursor),
        history_limit_reason = COALESCE(excluded.history_limit_reason, creator_accounts.history_limit_reason),
        next_run_at = COALESCE(excluded.next_run_at, creator_accounts.next_run_at),
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
    const deleteFts = this.db.prepare('DELETE FROM creator_posts_fts WHERE post_id = ?');
    const insertFts = this.db.prepare(
      'INSERT INTO creator_posts_fts (post_id, title, text) VALUES (?, ?, ?)'
    );
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
        deleteFts.run(item.id);
        insertFts.run(item.id, expandCjk(item.title), expandCjk(item.text));
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

  findVerifiedAccount(platform, externalAccountId) {
    this.ensureInitialized();
    const row = this.db.prepare(`
      SELECT a.*
      FROM creator_accounts a
      JOIN creators c ON c.id = a.creator_id
      WHERE a.platform = ? AND a.external_account_id = ?
        AND a.enabled = 1 AND c.review_status = 'verified'
    `).get(String(platform || '').toLowerCase(), String(externalAccountId || ''));
    if (!row) return null;
    const account = this.mapAccount(row);
    account.profileUrl = row.profile_url;
    account.verticalIds = this.db.prepare(
      'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
    ).all(row.creator_id).map((item) => item.vertical_id);
    return account;
  }

  commitBridgeBatch(batch = {}) {
    this.ensureInitialized();
    if (!batch.sourceId || !batch.nonce || !batch.runId || !batch.payloadId) {
      throw new TypeError('sourceId/nonce/runId/payloadId required');
    }
    if (!batch.accountId || !Array.isArray(batch.posts)) {
      throw new TypeError('accountId/posts required');
    }
    const receivedAt = iso(batch.receivedAt || Date.now(), 'receivedAt');
    const nonceExpiresAt = iso(
      batch.nonceExpiresAt || Date.parse(receivedAt) + 10 * 60 * 1000,
      'nonceExpiresAt'
    );
    const payloadExpiresAt = iso(
      batch.payloadExpiresAt || Date.parse(receivedAt) + 30 * 24 * 60 * 60 * 1000,
      'payloadExpiresAt'
    );
    const insertNonce = this.db.prepare(`
      INSERT INTO creator_bridge_nonces (source_id, nonce, received_at, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertPayload = this.db.prepare(`
      INSERT INTO creator_bridge_payloads (
        id, source_id, run_id, received_at, expires_at, body_sha256, item_count, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const linkPost = this.db.prepare(`
      INSERT INTO creator_bridge_payload_posts (payload_id, post_id) VALUES (?, ?)
    `);
    const transaction = this.db.transaction(() => {
      insertNonce.run(batch.sourceId, batch.nonce, receivedAt, nonceExpiresAt);
      this.recordRun({
        id: batch.runId,
        sourceId: batch.sourceId,
        accountId: batch.accountId,
        status: 'completed',
        startedAt: receivedAt,
        finishedAt: receivedAt,
        received: batch.posts.length,
        saved: batch.posts.length,
        metadata: batch.runMetadata || {}
      });
      const pageResult = this.commitPage({
        accountId: batch.accountId,
        cursorKind: `bridge:${batch.sourceId}`,
        posts: batch.posts,
        nextCursor: batch.nextCursor ?? null,
        exhausted: batch.exhausted === true,
        collectedAt: receivedAt
      });
      insertPayload.run(
        batch.payloadId,
        batch.sourceId,
        batch.runId,
        receivedAt,
        payloadExpiresAt,
        batch.bodySha256,
        batch.posts.length,
        json(batch.safePayload, {})
      );
      for (const post of batch.posts) linkPost.run(batch.payloadId, post.id);
      return pageResult;
    });
    return transaction();
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

  scheduleAccount(accountId, nextRunAt) {
    this.ensureInitialized();
    const result = this.db.prepare(`
      UPDATE creator_accounts SET next_run_at = ?, updated_at = ? WHERE id = ?
    `).run(iso(nextRunAt, 'nextRunAt'), iso(Date.now(), 'updatedAt'), accountId);
    if (result.changes !== 1) throw new Error(`Unknown creator account: ${accountId}`);
  }

  scheduleUnscheduledAccounts(nextRunAt) {
    this.ensureInitialized();
    const timestamp = iso(nextRunAt, 'nextRunAt');
    return this.db.prepare(`
      UPDATE creator_accounts
      SET next_run_at = ?, updated_at = ?
      WHERE enabled = 1 AND next_run_at IS NULL
    `).run(timestamp, timestamp).changes;
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

  listVerticals() {
    this.ensureInitialized();
    return this.db.prepare(`
      SELECT v.*,
        (SELECT COUNT(*) FROM creator_vertical_memberships m WHERE m.vertical_id = v.id) AS creator_count,
        (SELECT COUNT(*) FROM creator_post_verticals pv WHERE pv.vertical_id = v.id) AS post_count
      FROM creator_verticals v WHERE v.enabled = 1 ORDER BY v.id
    `).all().map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      enabled: bool(row.enabled),
      keywords: parseJson(row.keywords_json, []),
      negativeKeywords: parseJson(row.negative_keywords_json, []),
      creatorCount: row.creator_count,
      postCount: row.post_count
    }));
  }

  listCreators(options = {}) {
    this.ensureInitialized();
    const filters = {
      vertical: options.vertical || null,
      platform: options.platform || null,
      status: options.status || null
    };
    const hash = stableHash({ kind: 'creators', ...filters });
    const cursor = decodeCursor(options.cursor, hash);
    const clauses = [];
    const params = [];
    if (filters.vertical) {
      clauses.push('EXISTS (SELECT 1 FROM creator_vertical_memberships m WHERE m.creator_id = c.id AND m.vertical_id = ?)');
      params.push(filters.vertical);
    }
    if (filters.platform) {
      clauses.push('EXISTS (SELECT 1 FROM creator_accounts a WHERE a.creator_id = c.id AND a.platform = ?)');
      params.push(filters.platform);
    }
    if (filters.status) {
      clauses.push('c.review_status = ?');
      params.push(filters.status);
    }
    if (cursor) {
      clauses.push('c.id > ?');
      params.push(cursor.sort[0]);
    }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rows = this.db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM creator_accounts a WHERE a.creator_id = c.id) AS account_count,
        (SELECT MAX(p.published_at) FROM creator_posts p JOIN creator_accounts a ON a.id = p.account_id WHERE a.creator_id = c.id) AS latest_post_at
      FROM creators c
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY c.id ASC LIMIT ?
    `).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      kind: row.kind,
      reviewStatus: row.review_status,
      reviewedAt: row.reviewed_at,
      verticalIds: this.db.prepare(
        'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
      ).all(row.id).map((item) => item.vertical_id),
      accountCount: row.account_count,
      latestPostAt: row.latest_post_at
    }));
    return {
      items,
      nextCursor: hasMore ? encodeCursor({ h: hash, sort: [items.at(-1).id] }) : null
    };
  }

  getCreator(id) {
    this.ensureInitialized();
    const row = this.db.prepare('SELECT * FROM creators WHERE id = ?').get(id);
    if (!row) return null;
    const accounts = this.db.prepare(`
      SELECT a.*, b.state AS persisted_backfill_state, b.oldest_fetched_at AS persisted_oldest,
        b.newest_fetched_at AS persisted_newest, b.last_reconciled_at AS persisted_reconciled,
        b.history_limit_reason AS persisted_reason, b.pages_fetched, b.items_fetched, b.updated_at AS backfill_updated_at,
        (SELECT MAX(p.published_at) FROM creator_posts p WHERE p.account_id = a.id) AS latest_post_at,
        (SELECT COUNT(*) FROM creator_posts p WHERE p.account_id = a.id) AS post_count
      FROM creator_accounts a
      LEFT JOIN creator_backfills b ON b.account_id = a.id
      WHERE a.creator_id = ? ORDER BY a.platform, a.id
    `).all(id).map((account) => ({
      id: account.id,
      platform: account.platform,
      handle: account.handle,
      profileUrl: account.profile_url,
      region: account.region,
      sourceTier: account.source_tier,
      enabled: bool(account.enabled),
      authState: account.auth_state,
      lastVerifiedAt: account.last_verified_at,
      latestPostAt: account.latest_post_at,
      postCount: account.post_count,
      backfill: {
        state: account.persisted_backfill_state || account.backfill_state,
        oldestFetchedAt: account.persisted_oldest || account.oldest_fetched_at,
        newestFetchedAt: account.persisted_newest || account.newest_fetched_at,
        lastReconciledAt: account.persisted_reconciled || account.last_reconciled_at,
        historyLimitReason: account.persisted_reason || account.history_limit_reason,
        pagesFetched: Number(account.pages_fetched || 0),
        itemsFetched: Number(account.items_fetched || 0),
        updatedAt: account.backfill_updated_at || account.updated_at
      }
    }));
    return {
      id: row.id,
      displayName: row.display_name,
      kind: row.kind,
      reviewStatus: row.review_status,
      reviewedAt: row.reviewed_at,
      verticalIds: this.db.prepare(
        'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
      ).all(id).map((item) => item.vertical_id),
      accounts
    };
  }

  queryPosts(options = {}) {
    this.ensureInitialized();
    const q = normalizeSearch(options.q);
    const filters = {
      vertical: options.vertical || null,
      platform: options.platform || null,
      creator: options.creator || null,
      since: options.since || null,
      hot: options.hot === true
    };
    const hash = stableHash({ kind: 'posts', q, ...filters });
    const cursor = decodeCursor(options.cursor, hash);
    const clauses = ['p.deleted_at IS NULL'];
    const params = [];
    const joinFts = q ? 'JOIN creator_posts_fts ON creator_posts_fts.post_id = p.id' : '';
    if (q) {
      clauses.push('creator_posts_fts MATCH ?');
      params.push(literalFtsQuery(q));
    }
    if (filters.vertical) {
      clauses.push('EXISTS (SELECT 1 FROM creator_post_verticals pv WHERE pv.post_id = p.id AND pv.vertical_id = ?)');
      params.push(filters.vertical);
    }
    if (filters.platform) {
      clauses.push('p.platform = ?');
      params.push(filters.platform);
    }
    if (filters.creator) {
      clauses.push('a.creator_id = ?');
      params.push(filters.creator);
    }
    if (filters.since) {
      clauses.push('p.published_at >= ?');
      params.push(filters.since);
    }
    if (filters.hot) {
      clauses.push('score.score >= 60');
    }
    if (cursor) {
      if (q) {
        clauses.push(`(
          bm25(creator_posts_fts) > ? OR
          (bm25(creator_posts_fts) = ? AND (p.published_at < ? OR (p.published_at = ? AND p.id < ?)))
        )`);
        params.push(cursor.sort[0], cursor.sort[0], cursor.sort[1], cursor.sort[1], cursor.sort[2]);
      } else {
        clauses.push('(p.published_at < ? OR (p.published_at = ? AND p.id < ?))');
        params.push(cursor.sort[0], cursor.sort[0], cursor.sort[1]);
      }
    }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rank = q ? 'bm25(creator_posts_fts)' : 'NULL';
    const order = q
      ? 'search_rank ASC, p.published_at DESC, p.id DESC'
      : 'p.published_at DESC, p.id DESC';
    const rows = this.db.prepare(`
      SELECT p.*, a.creator_id, c.display_name AS creator_name,
        ${rank} AS search_rank,
        score.formula_version AS score_formula_version, score.score AS hotness_score,
        score.confidence AS hotness_confidence, score.components_json, score.penalties_json
      FROM creator_posts p
      JOIN creator_accounts a ON a.id = p.account_id
      JOIN creators c ON c.id = a.creator_id
      ${joinFts}
      LEFT JOIN creator_post_scores score ON score.id = (
        SELECT s.id FROM creator_post_scores s WHERE s.post_id = p.id
        ORDER BY s.captured_at DESC, s.id DESC LIMIT 1
      )
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${order} LIMIT ?
    `).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => ({
      ...this.mapPost(row),
      creatorId: row.creator_id,
      creatorName: row.creator_name,
      searchRank: q ? row.search_rank : null,
      hotness: row.hotness_score === null ? null : {
        formulaVersion: row.score_formula_version,
        score: row.hotness_score,
        confidence: row.hotness_confidence,
        components: parseJson(row.components_json, {}),
        penalties: parseJson(row.penalties_json, {})
      }
    }));
    const last = selected.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({
        h: hash,
        sort: q ? [last.search_rank, last.published_at, last.id] : [last.published_at, last.id]
      }) : null
    };
  }

  deletePosts(ids = []) {
    this.ensureInitialized();
    const uniqueIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
    const deleteFts = this.db.prepare('DELETE FROM creator_posts_fts WHERE post_id = ?');
    const deletePost = this.db.prepare('DELETE FROM creator_posts WHERE id = ?');
    const transaction = this.db.transaction(() => {
      let deleted = 0;
      for (const id of uniqueIds) {
        deleteFts.run(id);
        deleted += deletePost.run(id).changes;
      }
      return deleted;
    });
    return transaction();
  }

  queryTopics(options = {}) {
    this.ensureInitialized();
    const q = normalizeSearch(options.q);
    const filters = { vertical: options.vertical || null, since: options.since || null };
    const hash = stableHash({ kind: 'topics', q, ...filters });
    const cursor = decodeCursor(options.cursor, hash);
    const clauses = [];
    const params = [];
    if (filters.vertical) {
      clauses.push('t.vertical_id = ?');
      params.push(filters.vertical);
    }
    if (filters.since) {
      clauses.push('t.latest_seen_at >= ?');
      params.push(filters.since);
    }
    let cte = '';
    let join = '';
    let rank = 'NULL';
    if (q) {
      cte = `WITH matched AS (
        SELECT tp.topic_id, MIN(creator_posts_fts.rank) AS search_rank
        FROM creator_posts_fts
        JOIN creator_topic_posts tp ON tp.post_id = creator_posts_fts.post_id
        WHERE creator_posts_fts MATCH ? GROUP BY tp.topic_id
      )`;
      params.unshift(literalFtsQuery(q));
      join = 'JOIN matched m ON m.topic_id = t.id';
      rank = 'm.search_rank';
    }
    if (cursor) {
      if (q) {
        clauses.push(`(
          m.search_rank > ? OR
          (m.search_rank = ? AND (t.latest_seen_at < ? OR (t.latest_seen_at = ? AND t.id < ?)))
        )`);
        params.push(cursor.sort[0], cursor.sort[0], cursor.sort[1], cursor.sort[1], cursor.sort[2]);
      } else {
        clauses.push('(t.latest_seen_at < ? OR (t.latest_seen_at = ? AND t.id < ?))');
        params.push(cursor.sort[0], cursor.sort[0], cursor.sort[1]);
      }
    }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rows = this.db.prepare(`
      ${cte}
      SELECT t.*, ${rank} AS search_rank
      FROM creator_topics t ${join}
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ${q ? 'search_rank ASC,' : ''} t.latest_seen_at DESC, t.id DESC LIMIT ?
    `).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => this.mapCreatorTopic(row, q ? row.search_rank : null));
    const last = selected.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({
        h: hash,
        sort: q ? [last.search_rank, last.latest_seen_at, last.id] : [last.latest_seen_at, last.id]
      }) : null
    };
  }

  mapCreatorTopic(row, searchRank = null) {
    const payload = parseJson(row.payload_json, {});
    const evidence = Array.isArray(payload.evidence) ? payload.evidence.map((item) => ({
      postId: item.postId || null,
      url: safeHttps(item.url)
    })).filter((item) => item.url) : [];
    return {
      id: row.id,
      verticalId: row.vertical_id,
      title: row.title,
      summary: row.summary,
      firstSeenAt: row.first_seen_at,
      latestSeenAt: row.latest_seen_at,
      hotness: row.hotness,
      formulaVersion: row.formula_version,
      creatorCount: row.creator_count,
      platformCount: row.platform_count,
      searchRank,
      signals: payload.signals && typeof payload.signals === 'object' ? payload.signals : {},
      evidence
    };
  }

  getCreatorTopic(id) {
    this.ensureInitialized();
    const row = this.db.prepare('SELECT * FROM creator_topics WHERE id = ?').get(id);
    return row ? this.mapCreatorTopic(row) : null;
  }

  listHot(options = {}) {
    this.ensureInitialized();
    if (options.type === 'post') {
      return this.queryHotPosts(options);
    }
    return this.queryHotTopics(options);
  }

  queryHotTopics(options = {}) {
    this.ensureInitialized();
    const clauses = [];
    const params = [];
    if (options.vertical) { clauses.push('vertical_id = ?'); params.push(options.vertical); }
    if (options.since) { clauses.push('latest_seen_at >= ?'); params.push(options.since); }
    if (options.type === 'multi_creator') clauses.push('creator_count >= 3');
    if (options.type === 'cross_platform') {
      clauses.push('creator_count >= 3');
      clauses.push('platform_count >= 2');
    }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rows = this.db.prepare(`
      SELECT * FROM creator_topics
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY COALESCE(hotness, 0) DESC, latest_seen_at DESC, id DESC LIMIT ?
    `).all(...params, limit);
    return { items: rows.map((row) => this.mapCreatorTopic(row)), nextCursor: null };
  }

  queryHotPosts(options = {}) {
    this.ensureInitialized();
    const clauses = ['p.deleted_at IS NULL', 'score.score >= 60'];
    const params = [];
    if (options.vertical) {
      clauses.push('EXISTS (SELECT 1 FROM creator_post_verticals pv WHERE pv.post_id = p.id AND pv.vertical_id = ?)');
      params.push(options.vertical);
    }
    if (options.platform) { clauses.push('p.platform = ?'); params.push(options.platform); }
    if (options.creator) { clauses.push('a.creator_id = ?'); params.push(options.creator); }
    if (options.since) { clauses.push('p.published_at >= ?'); params.push(options.since); }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rows = this.db.prepare(`
      SELECT p.*, a.creator_id, c.display_name AS creator_name,
        score.formula_version AS score_formula_version, score.score AS hotness_score,
        score.confidence AS hotness_confidence, score.components_json, score.penalties_json
      FROM creator_posts p
      JOIN creator_accounts a ON a.id = p.account_id
      JOIN creators c ON c.id = a.creator_id
      JOIN creator_post_scores score ON score.id = (
        SELECT s.id FROM creator_post_scores s WHERE s.post_id = p.id
        ORDER BY s.captured_at DESC, s.id DESC LIMIT 1
      )
      WHERE ${clauses.join(' AND ')}
      ORDER BY score.score DESC, p.published_at DESC, p.id DESC LIMIT ?
    `).all(...params, limit);
    return {
      items: rows.map((row) => ({
        ...this.mapPost(row),
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        searchRank: null,
        hotness: {
          formulaVersion: row.score_formula_version,
          score: row.hotness_score,
          confidence: row.hotness_confidence,
          components: parseJson(row.components_json, {}),
          penalties: parseJson(row.penalties_json, {})
        }
      })),
      nextCursor: null
    };
  }

  listSourceCoverage(sources = []) {
    this.ensureInitialized();
    const byPlatform = this.db.prepare(`
      SELECT a.platform, COUNT(DISTINCT a.id) AS account_count,
        COUNT(DISTINCT CASE WHEN a.enabled = 1 THEN a.id END) AS enabled_account_count,
        MAX(p.published_at) AS latest_post_at,
        COUNT(DISTINCT p.id) AS post_count
      FROM creator_accounts a LEFT JOIN creator_posts p ON p.account_id = a.id
      GROUP BY a.platform
    `).all();
    const coverage = new Map(byPlatform.map((row) => [row.platform, row]));
    return sources.map((source) => {
      const row = coverage.get(source.platform) || {};
      return {
        id: source.id,
        platform: source.platform,
        tier: source.tier,
        configured: source.configured === true,
        schedulable: source.schedulable === true,
        status: source.status || 'unconfigured',
        lastSuccessAt: source.lastSuccessAt || null,
        lastAttemptAt: source.lastAttemptAt || null,
        lastFailureCode: source.lastFailureCode || null,
        setupHint: source.setupHint || null,
        accountCount: Number(row.account_count || 0),
        enabledAccountCount: Number(row.enabled_account_count || 0),
        postCount: Number(row.post_count || 0),
        latestPostAt: row.latest_post_at || null
      };
    });
  }

  getCoverageSummary() {
    this.ensureInitialized();
    const row = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM creators WHERE review_status = 'verified') AS verified_creators,
        (SELECT COUNT(*) FROM creator_accounts WHERE enabled = 1) AS enabled_accounts,
        (SELECT COUNT(*) FROM creator_posts WHERE deleted_at IS NULL) AS posts,
        (SELECT COUNT(*) FROM creator_topics) AS topics,
        (SELECT MAX(collected_at) FROM creator_posts) AS last_collected_at
    `).get();
    return {
      verifiedCreators: row.verified_creators,
      enabledAccounts: row.enabled_accounts,
      posts: row.posts,
      topics: row.topics,
      lastCollectedAt: row.last_collected_at
    };
  }

  appendCreatorEvent(event = {}) {
    this.ensureInitialized();
    if (!event.id || !event.eventType || !event.entityType || !event.entityId) {
      throw new TypeError('event id/type/entity required');
    }
    const occurredAt = iso(event.occurredAt || Date.now(), 'occurredAt');
    const result = this.db.prepare(`
      INSERT INTO creator_events (
        id, event_type, entity_type, entity_id, vertical_id, platform, score,
        formula_version, transition_bucket, payload_json, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.eventType, event.entityType, event.entityId,
      event.verticalId || null, event.platform || null,
      Number.isFinite(Number(event.score)) ? Number(event.score) : null,
      event.formulaVersion || null, event.transitionBucket || event.id,
      json(event.payload, {}), occurredAt, occurredAt
    );
    const seq = Number(result.lastInsertRowid);
    this.creatorEvents.emit('committed', { seq, id: event.id });
    return seq;
  }

  onCreatorEvent(listener) {
    this.creatorEvents.on('committed', listener);
    return () => this.creatorEvents.off('committed', listener);
  }

  resolveSubscriptionDeliveries(event, occurredAt) {
    this.ensureInitialized();
    const SubscriptionService = require('./subscription-service');
    return new SubscriptionService({ store: this, now: () => occurredAt }).matchEvent(event, occurredAt);
  }

  applyCreatorStateChange(change = {}) {
    this.ensureInitialized();
    if (!change.producer || !change.entityType || !change.entityId || !change.stateVersion
      || typeof change.applyState !== 'function' || typeof change.detectEvents !== 'function') {
      throw new TypeError('producer/entity/stateVersion/applyState/detectEvents required');
    }
    const insertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO creator_events (
        id, event_type, entity_type, entity_id, vertical_id, platform, score,
        formula_version, transition_bucket, payload_json, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertOutbox = this.db.prepare(`
      INSERT OR IGNORE INTO creator_delivery_outbox (
        id, event_id, subscription_id, endpoint_id, status, attempt_count,
        next_attempt_at, last_error, created_at, delivered_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL)
    `);
    const transaction = this.db.transaction(() => {
      const state = change.applyState({ store: this, db: this.db }) || {};
      const detected = change.detectEvents({
        producer: change.producer,
        entityType: change.entityType,
        entityId: change.entityId,
        stateVersion: change.stateVersion,
        occurredAt: change.occurredAt || change.stateVersion,
        before: state.before ?? null,
        after: state.after ?? null
      }) || [];
      const events = [];
      let outboxCount = 0;
      for (const detectedEvent of detected) {
        const { eventId } = require('./creator-event-detector');
        const event = detectedEvent?.id ? detectedEvent : { ...detectedEvent, id: eventId(detectedEvent) };
        if (!event?.id || !event.eventType || !event.entityType || !event.entityId || !event.transitionBucket) {
          throw new TypeError('invalid_creator_event');
        }
        const occurredAt = iso(event.occurredAt || change.stateVersion, 'occurredAt');
        const payload = { ...(event.payload || {}) };
        if (event.creatorId) payload.creatorId = event.creatorId;
        const inserted = insertEvent.run(
          event.id, event.eventType, event.entityType, event.entityId,
          event.verticalId || null, event.platform || null,
          Number.isFinite(Number(event.score)) ? Number(event.score) : null,
          event.formulaVersion || change.stateVersion,
          event.transitionBucket, json(payload, {}), occurredAt, occurredAt
        );
        if (!inserted.changes) continue;
        const normalizedEvent = { ...event, payload, occurredAt };
        events.push(normalizedEvent);
        const deliveries = this.resolveSubscriptionDeliveries(normalizedEvent, occurredAt);
        for (const delivery of deliveries) {
          const outboxId = `creator-outbox_${stableHash([event.id, delivery.subscriptionId, delivery.endpointId])}`;
          outboxCount += insertOutbox.run(
            outboxId, event.id, delivery.subscriptionId, delivery.endpointId,
            iso(delivery.nextAttemptAt || occurredAt, 'nextAttemptAt'), occurredAt
          ).changes;
        }
      }
      return { value: state.value, before: state.before ?? null, after: state.after ?? null, events, outboxCount };
    });
    const result = transaction();
    for (const event of result.events) {
      const row = this.db.prepare('SELECT seq FROM creator_events WHERE id = ?').get(event.id);
      if (row) this.creatorEvents.emit('committed', { seq: Number(row.seq), id: event.id });
    }
    return result;
  }

  claimDueOutbox(options = {}) {
    this.ensureInitialized();
    const now = iso(options.now || Date.now(), 'now');
    const leaseUntil = new Date(Date.parse(now) + Math.max(Number(options.leaseMs || 60_000), 1000)).toISOString();
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 500);
    const transaction = this.db.transaction(() => {
      const candidates = options.id ? this.db.prepare(`
        SELECT id FROM creator_delivery_outbox
        WHERE id = ? AND status IN ('pending', 'retry', 'processing') AND next_attempt_at <= ?
        LIMIT 1
      `).all(options.id, now) : this.db.prepare(`
        SELECT id FROM creator_delivery_outbox
        WHERE status IN ('pending', 'retry', 'processing') AND next_attempt_at <= ?
        ORDER BY next_attempt_at, id LIMIT ?
      `).all(now, limit);
      const claim = this.db.prepare(`
        UPDATE creator_delivery_outbox
        SET status='processing', attempt_count=attempt_count+1, next_attempt_at=?
        WHERE id=? AND status IN ('pending', 'retry', 'processing') AND next_attempt_at <= ?
      `);
      const claimed = [];
      for (const candidate of candidates) {
        if (claim.run(leaseUntil, candidate.id, now).changes) claimed.push(candidate.id);
      }
      if (!claimed.length) return [];
      const select = this.db.prepare(`
        SELECT o.*, e.event_type, e.entity_type, e.entity_id, e.vertical_id, e.platform,
          e.score, e.formula_version, e.payload_json, e.occurred_at,
          d.type AS endpoint_type, d.destination, d.secret_ref, d.enabled AS endpoint_enabled
        FROM creator_delivery_outbox o
        JOIN creator_events e ON e.id = o.event_id
        JOIN creator_delivery_endpoints d ON d.id = o.endpoint_id
        WHERE o.id = ?
      `);
      return claimed.map((id) => select.get(id)).filter(Boolean).map((row) => ({
        id: row.id,
        attemptCount: row.attempt_count,
        event: {
          id: row.event_id, eventType: row.event_type, entityType: row.entity_type,
          entityId: row.entity_id, verticalId: row.vertical_id, platform: row.platform,
          score: row.score, formulaVersion: row.formula_version,
          payload: publicEventPayload(parseJson(row.payload_json, {})), occurredAt: row.occurred_at
        },
        endpoint: {
          id: row.endpoint_id, type: row.endpoint_type, destination: row.destination,
          secretRef: row.secret_ref, enabled: bool(row.endpoint_enabled)
        }
      }));
    });
    return transaction();
  }

  finishOutboxAttempt(outboxId, result = {}) {
    this.ensureInitialized();
    const attemptedAt = iso(result.attemptedAt || Date.now(), 'attemptedAt');
    const status = ['delivered', 'retry', 'dead'].includes(result.status) ? result.status : 'retry';
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO creator_delivery_attempts (outbox_id, attempted_at, status, response_code, error)
        VALUES (?, ?, ?, ?, ?)
      `).run(outboxId, attemptedAt, status, result.responseCode ?? null, boundedText(result.error, 2000));
      const update = this.db.prepare(`
        UPDATE creator_delivery_outbox
        SET status=?, next_attempt_at=?, last_error=?, delivered_at=?
        WHERE id=? AND status='processing'
      `).run(
        status, iso(result.nextAttemptAt || attemptedAt, 'nextAttemptAt'),
        boundedText(result.error, 2000),
        status === 'delivered' ? iso(result.deliveredAt || attemptedAt, 'deliveredAt') : null,
        outboxId
      );
      if (!update.changes) throw new Error('outbox_not_claimed');
    });
    transaction();
  }

  replayDeadOutbox(options = {}) {
    this.ensureInitialized();
    const now = iso(options.now || Date.now(), 'now');
    if (options.id) {
      return this.db.prepare(`UPDATE creator_delivery_outbox SET status='pending', attempt_count=0, next_attempt_at=?, last_error=NULL, delivered_at=NULL WHERE id=? AND status='dead'`)
        .run(now, options.id).changes;
    }
    return this.db.prepare(`UPDATE creator_delivery_outbox SET status='pending', attempt_count=0, next_attempt_at=?, last_error=NULL, delivered_at=NULL WHERE status='dead'`)
      .run(now).changes;
  }

  enqueueEndpointTest(userId, endpointId, options = {}) {
    this.ensureInitialized();
    const endpoint = this.db.prepare(
      'SELECT id FROM creator_delivery_endpoints WHERE id = ? AND user_id = ? AND enabled = 1'
    ).get(endpointId, userId);
    if (!endpoint) return null;
    const now = iso(options.now || Date.now(), 'now');
    const nonce = crypto.randomUUID();
    const subscriptionId = `subscription_endpoint_test_${stableHash([userId, endpointId])}`;
    const eventId = `creator-event_test_${nonce}`;
    const outboxId = `creator-outbox_test_${nonce}`;
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO creator_subscriptions (
          id, user_id, name, filters_json, delivery_mode, quiet_hours_json,
          enabled, created_at, updated_at
        ) VALUES (?, ?, '__aya_endpoint_test__', '{}', 'immediate', '{}', 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
      `).run(subscriptionId, userId, now, now);
      this.db.prepare(`
        INSERT OR IGNORE INTO creator_subscription_endpoints (subscription_id, endpoint_id, created_at)
        VALUES (?, ?, ?)
      `).run(subscriptionId, endpointId, now);
      this.db.prepare(`
        INSERT INTO creator_events (
          id, event_type, entity_type, entity_id, vertical_id, platform, score,
          formula_version, transition_bucket, payload_json, occurred_at, created_at
        ) VALUES (?, 'delivery.test', 'delivery_endpoint', ?, NULL, NULL, NULL,
          'delivery-test-v1', ?, ?, ?, ?)
      `).run(eventId, endpointId, nonce, json({ title: 'AyaNews delivery endpoint test' }, {}), now, now);
      this.db.prepare(`
        INSERT INTO creator_delivery_outbox (
          id, event_id, subscription_id, endpoint_id, status, attempt_count,
          next_attempt_at, last_error, created_at, delivered_at
        ) VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL)
      `).run(outboxId, eventId, subscriptionId, endpointId, now, now);
    });
    transaction();
    const seq = this.db.prepare('SELECT seq FROM creator_events WHERE id = ?').get(eventId)?.seq;
    if (seq) this.creatorEvents.emit('committed', { seq: Number(seq), id: eventId });
    return outboxId;
  }

  listDeliveries(userId, options = {}) {
    this.ensureInitialized();
    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
    return this.db.prepare(`
      SELECT o.id, o.endpoint_id, o.status, o.attempt_count, o.next_attempt_at,
             o.last_error, o.created_at, o.delivered_at,
             e.event_type, e.occurred_at,
             a.attempted_at, a.status AS attempt_status, a.response_code, a.error AS attempt_error
      FROM creator_delivery_outbox o
      JOIN creator_delivery_endpoints d ON d.id = o.endpoint_id
      JOIN creator_events e ON e.id = o.event_id
      LEFT JOIN creator_delivery_attempts a ON a.id = (
        SELECT id FROM creator_delivery_attempts WHERE outbox_id = o.id ORDER BY id DESC LIMIT 1
      )
      WHERE d.user_id = ?
      ORDER BY o.created_at DESC, o.id DESC LIMIT ?
    `).all(userId, limit).map((row) => ({
      id: row.id,
      endpointId: row.endpoint_id,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
      lastError: boundedText(row.last_error, 500),
      createdAt: row.created_at,
      deliveredAt: row.delivered_at,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      latestAttempt: row.attempted_at ? {
        attemptedAt: row.attempted_at,
        status: row.attempt_status,
        responseCode: row.response_code,
        error: boundedText(row.attempt_error, 500)
      } : null
    }));
  }

  listCreatorChanges(options = {}) {
    this.ensureInitialized();
    const since = Math.max(Number(options.since || 0), 0);
    const filters = [];
    const filterParams = [];
    if (options.vertical) { filters.push('vertical_id = ?'); filterParams.push(options.vertical); }
    if (options.platform) { filters.push('platform = ?'); filterParams.push(options.platform); }
    if (options.creator) {
      filters.push(`(
        (entity_type = 'creator' AND entity_id = ?) OR
        (entity_type = 'post' AND entity_id IN (
          SELECT p.id FROM creator_posts p JOIN creator_accounts a ON a.id = p.account_id WHERE a.creator_id = ?
        ))
      )`);
      filterParams.push(options.creator, options.creator);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const bounds = this.db.prepare(`
      SELECT MIN(seq) AS oldest, MAX(seq) AS latest FROM creator_events ${where}
    `).get(...filterParams);
    const oldestCursor = Number(bounds.oldest || 0);
    const latestCursor = Number(bounds.latest || 0);
    if (oldestCursor > 1 && since < oldestCursor - 1) {
      return { expired: true, items: [], nextCursor: latestCursor, oldestCursor, latestCursor };
    }
    const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
    const itemWhere = ['seq > ?', ...filters];
    const rows = this.db.prepare(`
      SELECT * FROM creator_events WHERE ${itemWhere.join(' AND ')} ORDER BY seq ASC LIMIT ?
    `).all(since, ...filterParams, limit);
    const items = rows.map((row) => ({
      seq: row.seq,
      id: row.id,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      verticalId: row.vertical_id,
      platform: row.platform,
      score: row.score,
      formulaVersion: row.formula_version,
      occurredAt: row.occurred_at,
      payload: publicEventPayload(parseJson(row.payload_json, {}))
    }));
    return {
      expired: false,
      items,
      nextCursor: items.at(-1)?.seq ?? since,
      oldestCursor,
      latestCursor
    };
  }

  listBackfills(options = {}) {
    this.ensureInitialized();
    const clauses = [];
    const params = [];
    if (options.state) { clauses.push('COALESCE(b.state, a.backfill_state) = ?'); params.push(options.state); }
    if (options.platform) { clauses.push('a.platform = ?'); params.push(options.platform); }
    const hash = stableHash({ kind: 'backfills', state: options.state || null, platform: options.platform || null });
    const cursor = decodeCursor(options.cursor, hash);
    if (cursor) { clauses.push('a.id > ?'); params.push(cursor.sort[0]); }
    const limit = Math.min(Math.max(Number(options.limit || 20), 1), 100);
    const rows = this.db.prepare(`
      SELECT a.id AS account_id, a.creator_id, a.platform,
        COALESCE(b.state, a.backfill_state) AS state,
        COALESCE(b.oldest_fetched_at, a.oldest_fetched_at) AS oldest_fetched_at,
        COALESCE(b.newest_fetched_at, a.newest_fetched_at) AS newest_fetched_at,
        COALESCE(b.last_reconciled_at, a.last_reconciled_at) AS last_reconciled_at,
        COALESCE(b.history_limit_reason, a.history_limit_reason) AS history_limit_reason,
        COALESCE(b.pages_fetched, 0) AS pages_fetched,
        COALESCE(b.items_fetched, 0) AS items_fetched,
        COALESCE(b.updated_at, a.updated_at) AS updated_at
      FROM creator_accounts a LEFT JOIN creator_backfills b ON b.account_id = a.id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY a.id ASC LIMIT ?
    `).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => ({
      accountId: row.account_id,
      creatorId: row.creator_id,
      platform: row.platform,
      state: row.state,
      oldestFetchedAt: row.oldest_fetched_at,
      newestFetchedAt: row.newest_fetched_at,
      lastReconciledAt: row.last_reconciled_at,
      historyLimitReason: row.history_limit_reason,
      pagesFetched: row.pages_fetched,
      itemsFetched: row.items_fetched,
      updatedAt: row.updated_at
    }));
    return {
      items,
      nextCursor: hasMore ? encodeCursor({ h: hash, sort: [selected.at(-1).account_id] }) : null
    };
  }

  getPost(id) {
    this.ensureInitialized();
    const row = this.db.prepare('SELECT * FROM creator_posts WHERE id = ?').get(id);
    return row ? this.mapPost(row) : null;
  }

  recordHotnessScore(postId, score = {}, capturedAt = Date.now()) {
    this.ensureInitialized();
    if (!postId || !score.formulaVersion || !Number.isFinite(Number(score.score))) {
      throw new TypeError('postId/formulaVersion/score required');
    }
    const timestamp = iso(capturedAt, 'capturedAt');
    const insert = this.db.prepare(`
      INSERT INTO creator_post_scores (
        post_id, captured_at, formula_version, score, unrounded_score, confidence,
        inputs_json, components_json, penalties_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const { detectCreatorEvents } = require('./creator-event-detector');
    const stateChange = this.applyCreatorStateChange({
      producer: 'hotness', entityType: 'post', entityId: postId, stateVersion: score.formulaVersion,
      occurredAt: timestamp,
      applyState: () => {
        const before = this.getLatestHotnessScore(postId);
        insert.run(
          postId, timestamp, score.formulaVersion, Number(score.score), Number(score.unroundedScore),
          score.confidence || 'low', json(score.inputs, {}), json(score.components, {}),
          json(score.penalties, {}), timestamp
        );
        const post = this.db.prepare(`
          SELECT p.platform, a.creator_id, pv.vertical_id
          FROM creator_posts p JOIN creator_accounts a ON a.id = p.account_id
          LEFT JOIN creator_post_verticals pv ON pv.post_id = p.id
          WHERE p.id = ? ORDER BY pv.vertical_id LIMIT 1
        `).get(postId) || {};
        return {
          before,
          after: {
            ...score, score: Number(score.score), platform: post.platform || null,
            creatorId: post.creator_id || null, verticalId: post.vertical_id || null
          }
        };
      },
      detectEvents: detectCreatorEvents
    });
    return stateChange;
  }

  getLatestHotnessScore(postId) {
    this.ensureInitialized();
    const row = this.db.prepare(`
      SELECT * FROM creator_post_scores
      WHERE post_id = ? ORDER BY captured_at DESC, id DESC LIMIT 1
    `).get(postId);
    return row ? {
      postId: row.post_id,
      capturedAt: row.captured_at,
      formulaVersion: row.formula_version,
      score: row.score,
      unroundedScore: row.unrounded_score,
      confidence: row.confidence,
      inputs: parseJson(row.inputs_json, {}),
      components: parseJson(row.components_json, {}),
      penalties: parseJson(row.penalties_json, {})
    } : null;
  }

  compactMetricSnapshots(options = {}) {
    this.ensureInitialized();
    const nowMs = Date.parse(iso(options.now || Date.now(), 'now'));
    const fineCutoff = new Date(nowMs - Number(options.fineHours || 72) * 3_600_000).toISOString();
    const dailyCutoff = new Date(nowMs - Number(options.dailyDays || 180) * 86_400_000).toISOString();
    const rows = this.db.prepare(`
      SELECT id, post_id, captured_at
      FROM creator_post_metrics WHERE captured_at < ?
      ORDER BY post_id, captured_at DESC, id DESC
    `).all(fineCutoff);
    const keepDaily = new Set();
    const deleteIds = [];
    for (const row of rows) {
      if (row.captured_at < dailyCutoff) {
        deleteIds.push(row.id);
        continue;
      }
      const day = row.captured_at.slice(0, 10);
      const key = `${row.post_id}\u0000${day}`;
      if (keepDaily.has(key)) deleteIds.push(row.id);
      else keepDaily.add(key);
    }
    const remove = this.db.prepare('DELETE FROM creator_post_metrics WHERE id = ?');
    const transaction = this.db.transaction(() => {
      for (const id of deleteIds) remove.run(id);
    });
    transaction();
    return { deleted: deleteIds.length, dailyKept: keepDaily.size, fineCutoff, dailyCutoff };
  }

  mapAccount(row) {
    const verticalIds = this.db.prepare(
      'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
    ).all(row.creator_id).map((item) => item.vertical_id);
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
      nextRunAt: row.next_run_at,
      profileUrl: row.profile_url,
      nextCursor: row.next_cursor,
      historyLimitReason: row.history_limit_reason,
      verticalIds
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
    this.creatorEvents.removeAllListeners();
    if (this.db) this.db.close();
    this.db = null;
    this.initialized = false;
  }
}

module.exports = CreatorStore;
