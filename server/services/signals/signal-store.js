const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

function json(value, fallback = {}) {
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

function toBoolean(value) {
  return value === true || Number(value) === 1;
}

function normalizeIso(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid timestamp: ${value}`);
  return date.toISOString();
}

class SignalStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.AINEWS_DB_PATH || path.join(__dirname, '../../data/ainews.db');
    this.db = options.db || null;
    this.initialized = false;
  }

  initialize(catalog = []) {
    if (!this.db) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        external_id TEXT,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_trust_class TEXT NOT NULL,
        platform TEXT NOT NULL,
        region TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        url TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        author TEXT,
        language TEXT,
        published_at TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        tags_json TEXT NOT NULL DEFAULT '[]',
        repo_full_name TEXT,
        raw_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_fingerprint ON signals(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_signals_published_at ON signals(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_signals_platform ON signals(platform, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source_id, published_at DESC);

      CREATE TABLE IF NOT EXISTS signal_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tier TEXT NOT NULL,
        platform TEXT NOT NULL,
        region TEXT NOT NULL,
        mode TEXT NOT NULL,
        adapter TEXT NOT NULL,
        trust_class TEXT NOT NULL,
        endpoint TEXT,
        configured INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 0,
        schedulable INTEGER NOT NULL DEFAULT 0,
        setup_hint TEXT,
        last_attempt_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_received INTEGER NOT NULL DEFAULT 0,
        last_saved INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signal_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        received INTEGER NOT NULL DEFAULT 0,
        saved INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        FOREIGN KEY(source_id) REFERENCES signal_sources(id)
      );
      CREATE INDEX IF NOT EXISTS idx_signal_runs_source_started ON signal_runs(source_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        anchor TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        summary TEXT,
        first_seen_at TEXT NOT NULL,
        latest_seen_at TEXT NOT NULL,
        trend_score REAL NOT NULL DEFAULT 0,
        creator_score REAL NOT NULL DEFAULT 0,
        trend_direction TEXT NOT NULL DEFAULT 'steady',
        evidence_strength TEXT NOT NULL DEFAULT 'single-source',
        formula_version TEXT NOT NULL,
        score_breakdown_json TEXT NOT NULL DEFAULT '{}',
        opportunity_json TEXT NOT NULL DEFAULT '{}',
        cluster_reasons_json TEXT NOT NULL DEFAULT '[]',
        active INTEGER NOT NULL DEFAULT 1,
        refresh_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_anchor ON topics(anchor);
      CREATE INDEX IF NOT EXISTS idx_topics_score ON topics(active, trend_score DESC, latest_seen_at DESC);

      CREATE TABLE IF NOT EXISTS topic_aliases (
        alias_id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(canonical_id) REFERENCES topics(id)
      );

      CREATE TABLE IF NOT EXISTS topic_signals (
        topic_id TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        attached_at TEXT NOT NULL,
        PRIMARY KEY(topic_id, signal_id),
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY(signal_id) REFERENCES signals(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_topic_signals_signal ON topic_signals(signal_id);

      CREATE TABLE IF NOT EXISTS topic_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT NOT NULL,
        refresh_id TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        trend_score REAL NOT NULL,
        creator_score REAL NOT NULL,
        trend_direction TEXT NOT NULL,
        formula_version TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_topic_snapshots_topic_time ON topic_snapshots(topic_id, captured_at DESC);

      CREATE TABLE IF NOT EXISTS topic_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_topic_changes_seq ON topic_changes(seq);
      CREATE INDEX IF NOT EXISTS idx_topic_changes_time ON topic_changes(changed_at DESC);
    `);

    if (Array.isArray(catalog) && catalog.length) this.syncSourceCatalog(catalog);
    this.initialized = true;
    return this;
  }

  ensureInitialized() {
    if (!this.db) this.initialize();
  }

  syncSourceCatalog(catalog) {
    this.ensureInitialized();
    const statement = this.db.prepare(`
      INSERT INTO signal_sources (
        id, name, tier, platform, region, mode, adapter, trust_class, endpoint,
        configured, enabled, schedulable, setup_hint, updated_at
      ) VALUES (
        @id, @name, @tier, @platform, @region, @mode, @adapter, @trustClass, @endpoint,
        @configured, @enabled, @schedulable, @setupHint, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        tier = excluded.tier,
        platform = excluded.platform,
        region = excluded.region,
        mode = excluded.mode,
        adapter = excluded.adapter,
        trust_class = excluded.trust_class,
        endpoint = excluded.endpoint,
        configured = excluded.configured,
        enabled = excluded.enabled,
        schedulable = excluded.schedulable,
        setup_hint = excluded.setup_hint,
        updated_at = excluded.updated_at
    `);
    const now = new Date().toISOString();
    const transaction = this.db.transaction((items) => {
      for (const item of items) statement.run({
        ...item,
        endpoint: item.endpoint || null,
        configured: item.configured ? 1 : 0,
        enabled: item.enabled ? 1 : 0,
        schedulable: item.schedulable ? 1 : 0,
        setupHint: item.setupHint || null,
        updatedAt: now
      });
    });
    transaction(catalog);
  }

  upsertSignals(signals = []) {
    this.ensureInitialized();
    const insert = this.db.prepare(`
      INSERT INTO signals (
        id, fingerprint, external_id, source_id, source_name, source_trust_class,
        platform, region, kind, title, summary, url, canonical_url, author, language,
        published_at, collected_at, first_seen_at, last_seen_at, metrics_json,
        tags_json, repo_full_name, raw_json
      ) VALUES (
        @id, @fingerprint, @externalId, @sourceId, @sourceName, @sourceTrustClass,
        @platform, @region, @kind, @title, @summary, @url, @canonicalUrl, @author, @language,
        @publishedAt, @collectedAt, @firstSeenAt, @lastSeenAt, @metricsJson,
        @tagsJson, @repoFullName, @rawJson
      )
      ON CONFLICT(id) DO UPDATE SET
        source_name = excluded.source_name,
        title = excluded.title,
        summary = excluded.summary,
        author = excluded.author,
        language = excluded.language,
        collected_at = excluded.collected_at,
        last_seen_at = excluded.last_seen_at,
        metrics_json = excluded.metrics_json,
        tags_json = excluded.tags_json,
        repo_full_name = COALESCE(excluded.repo_full_name, signals.repo_full_name),
        raw_json = excluded.raw_json
    `);
    const exists = this.db.prepare('SELECT 1 FROM signals WHERE id = ?');
    const result = { inserted: 0, updated: 0 };
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        const wasPresent = Boolean(exists.get(item.id));
        insert.run({
          ...item,
          externalId: item.externalId || null,
          summary: item.summary || null,
          author: item.author || null,
          language: item.language || null,
          metricsJson: json(item.metrics),
          tagsJson: json(item.tags, []),
          repoFullName: item.repoFullName || null,
          rawJson: item.rawJson || '{}'
        });
        result[wasPresent ? 'updated' : 'inserted'] += 1;
      }
    });
    transaction(signals);
    return result;
  }

  startSourceRun(sourceId, startedAt = new Date()) {
    this.ensureInitialized();
    const id = crypto.randomUUID();
    const timestamp = normalizeIso(startedAt);
    this.db.prepare(`
      INSERT INTO signal_runs (id, source_id, status, started_at)
      VALUES (?, ?, 'running', ?)
    `).run(id, sourceId, timestamp);
    this.db.prepare(`
      UPDATE signal_sources SET last_attempt_at = ?, updated_at = ? WHERE id = ?
    `).run(timestamp, timestamp, sourceId);
    return id;
  }

  finishSourceRun(runId, result = {}) {
    this.ensureInitialized();
    const run = this.db.prepare('SELECT * FROM signal_runs WHERE id = ?').get(runId);
    if (!run) throw new Error(`Unknown source run: ${runId}`);
    if (!['success', 'failure', 'skipped'].includes(result.status)) {
      throw new TypeError('Source run status 必须是 success/failure/skipped');
    }
    const finishedAt = normalizeIso(result.finishedAt || new Date());
    const received = Number(result.received || 0);
    const saved = Number(result.saved || 0);
    const error = result.error ? String(result.error).slice(0, 1000) : null;
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE signal_runs
        SET status = ?, finished_at = ?, received = ?, saved = ?, error = ?
        WHERE id = ?
      `).run(result.status, finishedAt, received, saved, error, runId);

      if (result.status === 'success') {
        this.db.prepare(`
          UPDATE signal_sources SET
            last_attempt_at = ?, last_success_at = ?, last_error = NULL,
            failure_count = 0, last_received = ?, last_saved = ?, updated_at = ?
          WHERE id = ?
        `).run(finishedAt, finishedAt, received, saved, finishedAt, run.source_id);
      } else if (result.status === 'failure') {
        this.db.prepare(`
          UPDATE signal_sources SET
            last_attempt_at = ?, last_error = ?, failure_count = failure_count + 1,
            last_received = ?, last_saved = ?, updated_at = ?
          WHERE id = ?
        `).run(finishedAt, error || 'unknown error', received, saved, finishedAt, run.source_id);
      } else {
        this.db.prepare(`
          UPDATE signal_sources SET last_attempt_at = ?, updated_at = ? WHERE id = ?
        `).run(finishedAt, finishedAt, run.source_id);
      }
    });
    transaction();
  }

  listSourceHealth() {
    this.ensureInitialized();
    return this.db.prepare('SELECT * FROM signal_sources ORDER BY tier, name, id').all().map((row) => {
      const configured = toBoolean(row.configured);
      const enabled = toBoolean(row.enabled);
      let status = 'pending';
      if (!enabled) status = 'disabled';
      else if (!configured) status = 'unconfigured';
      else if (row.failure_count >= 3) status = 'offline';
      else if (row.failure_count > 0) status = 'degraded';
      else if (row.last_success_at) status = 'online';
      return {
        id: row.id,
        name: row.name,
        tier: row.tier,
        platform: row.platform,
        region: row.region,
        mode: row.mode,
        trustClass: row.trust_class,
        configured,
        enabled,
        schedulable: toBoolean(row.schedulable),
        status,
        setupHint: row.setup_hint,
        lastAttemptAt: row.last_attempt_at,
        lastSuccessAt: row.last_success_at,
        lastError: row.last_error,
        failureCount: row.failure_count,
        lastReceived: row.last_received,
        lastSaved: row.last_saved
      };
    });
  }

  listRecentSignals({ windowHours = 72, now = new Date(), limit = 2000 } = {}) {
    this.ensureInitialized();
    const cutoff = new Date(new Date(now).getTime() - windowHours * 3600000).toISOString();
    return this.db.prepare(`
      SELECT * FROM signals
      WHERE published_at >= ?
      ORDER BY published_at DESC, id ASC
      LIMIT ?
    `).all(cutoff, Math.max(1, Math.min(Number(limit) || 2000, 10000))).map((row) => this.mapSignal(row));
  }

  listTopicIdentityState() {
    this.ensureInitialized();
    const rows = this.db.prepare(`
      SELECT id, anchor, title, summary, active, updated_at
      FROM topics
      ORDER BY id ASC
    `).all();
    const relations = this.db.prepare(`
      SELECT signal_id FROM topic_signals WHERE topic_id = ? ORDER BY signal_id ASC
    `);
    return rows.map((row) => ({
      id: row.id,
      anchor: row.anchor,
      title: row.title,
      summary: row.summary,
      active: toBoolean(row.active),
      updatedAt: row.updated_at,
      signalIds: relations.all(row.id).map((item) => item.signal_id)
    }));
  }

  listLatestTopicSnapshots() {
    this.ensureInitialized();
    return this.db.prepare(`
      SELECT snapshot.*
      FROM topic_snapshots snapshot
      JOIN (
        SELECT topic_id, MAX(id) AS latest_id
        FROM topic_snapshots
        GROUP BY topic_id
      ) latest ON latest.latest_id = snapshot.id
      ORDER BY snapshot.topic_id ASC
    `).all().map((row) => ({
      topicId: row.topic_id,
      refreshId: row.refresh_id,
      capturedAt: row.captured_at,
      trendScore: row.trend_score,
      creatorScore: row.creator_score,
      trendDirection: row.trend_direction,
      formulaVersion: row.formula_version,
      payload: parseJson(row.payload_json, {})
    }));
  }

  mapSignal(row) {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      externalId: row.external_id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceTrustClass: row.source_trust_class,
      platform: row.platform,
      region: row.region,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      url: row.url,
      canonicalUrl: row.canonical_url,
      author: row.author,
      language: row.language,
      publishedAt: row.published_at,
      collectedAt: row.collected_at,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      metrics: parseJson(row.metrics_json, {}),
      tags: parseJson(row.tags_json, []),
      repoFullName: row.repo_full_name,
      rawJson: row.raw_json
    };
  }

  replaceTopics({ topics = [], aliases = [], refreshId, generatedAt = new Date() } = {}) {
    this.ensureInitialized();
    if (!refreshId) throw new TypeError('refreshId is required');
    const timestamp = normalizeIso(generatedAt);
    const getExisting = this.db.prepare('SELECT * FROM topics WHERE id = ?');
    const upsertTopic = this.db.prepare(`
      INSERT INTO topics (
        id, anchor, title, summary, first_seen_at, latest_seen_at, trend_score,
        creator_score, trend_direction, evidence_strength, formula_version,
        score_breakdown_json, opportunity_json, cluster_reasons_json, active,
        refresh_id, updated_at
      ) VALUES (
        @id, @anchor, @title, @summary, @firstSeenAt, @latestSeenAt, @trendScore,
        @creatorScore, @trendDirection, @evidenceStrength, @formulaVersion,
        @scoreBreakdownJson, @opportunityJson, @clusterReasonsJson, 1,
        @refreshId, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        anchor = excluded.anchor,
        title = excluded.title,
        summary = excluded.summary,
        first_seen_at = MIN(topics.first_seen_at, excluded.first_seen_at),
        latest_seen_at = excluded.latest_seen_at,
        trend_score = excluded.trend_score,
        creator_score = excluded.creator_score,
        trend_direction = excluded.trend_direction,
        evidence_strength = excluded.evidence_strength,
        formula_version = excluded.formula_version,
        score_breakdown_json = excluded.score_breakdown_json,
        opportunity_json = excluded.opportunity_json,
        cluster_reasons_json = excluded.cluster_reasons_json,
        active = 1,
        refresh_id = excluded.refresh_id,
        updated_at = excluded.updated_at
    `);
    const insertRelation = this.db.prepare(`
      INSERT OR IGNORE INTO topic_signals (topic_id, signal_id, attached_at) VALUES (?, ?, ?)
    `);
    const insertSnapshot = this.db.prepare(`
      INSERT INTO topic_snapshots (
        topic_id, refresh_id, captured_at, trend_score, creator_score,
        trend_direction, formula_version, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertChange = this.db.prepare(`
      INSERT INTO topic_changes (topic_id, change_type, changed_at, payload_json)
      VALUES (?, ?, ?, ?)
    `);
    const upsertAlias = this.db.prepare(`
      INSERT INTO topic_aliases (alias_id, canonical_id, reason, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(alias_id) DO UPDATE SET
        canonical_id = excluded.canonical_id,
        reason = excluded.reason
    `);

    const transaction = this.db.transaction(() => {
      this.db.prepare('UPDATE topics SET active = 0').run();
      for (const topic of topics) {
        const existing = getExisting.get(topic.id);
        const payload = {
          ...topic,
          scoreBreakdownJson: json(topic.scoreBreakdown),
          opportunityJson: json(topic.opportunity),
          clusterReasonsJson: json(topic.clusterReasons, []),
          refreshId,
          updatedAt: timestamp,
          summary: topic.summary || null
        };
        upsertTopic.run(payload);
        this.db.prepare('DELETE FROM topic_signals WHERE topic_id = ?').run(topic.id);
        for (const signalId of topic.signalIds || []) insertRelation.run(topic.id, signalId, timestamp);
        insertSnapshot.run(
          topic.id,
          refreshId,
          timestamp,
          topic.trendScore,
          topic.creatorScore,
          topic.trendDirection,
          topic.formulaVersion,
          json({ evidenceCount: (topic.signalIds || []).length, scoreBreakdown: topic.scoreBreakdown })
        );
        const changed = !existing ||
          existing.trend_score !== topic.trendScore ||
          existing.creator_score !== topic.creatorScore ||
          existing.trend_direction !== topic.trendDirection ||
          existing.latest_seen_at !== topic.latestSeenAt;
        if (changed) insertChange.run(
          topic.id,
          existing ? 'updated' : 'new',
          timestamp,
          json({
            trendScore: topic.trendScore,
            creatorScore: topic.creatorScore,
            trendDirection: topic.trendDirection,
            latestSeenAt: topic.latestSeenAt
          })
        );
      }
      for (const alias of aliases) {
        upsertAlias.run(alias.aliasId, alias.canonicalId, alias.reason || null, timestamp);
      }
    });
    transaction();
  }

  resolveTopicId(id) {
    const direct = this.db.prepare('SELECT id FROM topics WHERE id = ?').get(id);
    if (direct) return direct.id;
    const alias = this.db.prepare('SELECT canonical_id FROM topic_aliases WHERE alias_id = ?').get(id);
    return alias?.canonical_id || null;
  }

  getTopic(id) {
    this.ensureInitialized();
    const canonicalId = this.resolveTopicId(id);
    if (!canonicalId) return null;
    const row = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(canonicalId);
    if (!row) return null;
    const signals = this.db.prepare(`
      SELECT s.* FROM signals s
      JOIN topic_signals ts ON ts.signal_id = s.id
      WHERE ts.topic_id = ?
      ORDER BY s.published_at DESC, s.id ASC
    `).all(canonicalId).map((item) => this.mapSignal(item));
    return this.mapTopic(row, signals, canonicalId);
  }

  listTopics({ windowHours = 72, now = new Date(), limit = 100, offset = 0 } = {}) {
    this.ensureInitialized();
    const cutoff = new Date(new Date(now).getTime() - windowHours * 3600000).toISOString();
    return this.db.prepare(`
      SELECT * FROM topics
      WHERE active = 1 AND latest_seen_at >= ?
      ORDER BY trend_score DESC, latest_seen_at DESC, id ASC
      LIMIT ? OFFSET ?
    `).all(cutoff, Math.max(1, Math.min(Number(limit) || 100, 500)), Math.max(0, Number(offset) || 0))
      .map((row) => this.mapTopic(row, null, row.id));
  }

  mapTopic(row, signals = null, canonicalId = row.id) {
    const evidenceCount = this.db.prepare(
      'SELECT COUNT(*) AS count FROM topic_signals WHERE topic_id = ?'
    ).get(row.id).count;
    return {
      id: row.id,
      canonicalTopicId: canonicalId,
      anchor: row.anchor,
      title: row.title,
      summary: row.summary,
      firstSeenAt: row.first_seen_at,
      latestSeenAt: row.latest_seen_at,
      trendScore: row.trend_score,
      creatorScore: row.creator_score,
      trendDirection: row.trend_direction,
      evidenceStrength: row.evidence_strength,
      formulaVersion: row.formula_version,
      scoreBreakdown: parseJson(row.score_breakdown_json, {}),
      opportunity: parseJson(row.opportunity_json, {}),
      clusterReasons: parseJson(row.cluster_reasons_json, []),
      evidenceCount,
      ...(signals ? { signals } : {})
    };
  }

  listChanges({ cursor = 0, limit = 100 } = {}) {
    this.ensureInitialized();
    const normalizedCursor = Math.max(0, Number(cursor) || 0);
    const bounds = this.db.prepare(`
      SELECT MIN(seq) AS oldest, MAX(seq) AS latest FROM topic_changes
    `).get();
    if (!bounds.oldest) {
      return { expired: false, items: [], nextCursor: normalizedCursor, oldestCursor: null, latestCursor: null };
    }
    if (normalizedCursor < bounds.oldest - 1) {
      return {
        expired: true,
        items: [],
        nextCursor: bounds.latest,
        oldestCursor: bounds.oldest,
        latestCursor: bounds.latest
      };
    }
    const items = this.db.prepare(`
      SELECT seq, topic_id, change_type, changed_at, payload_json
      FROM topic_changes
      WHERE seq > ?
      ORDER BY seq ASC
      LIMIT ?
    `).all(normalizedCursor, Math.max(1, Math.min(Number(limit) || 100, 500))).map((row) => ({
      seq: row.seq,
      topicId: this.resolveTopicId(row.topic_id) || row.topic_id,
      changeType: row.change_type,
      changedAt: row.changed_at,
      payload: parseJson(row.payload_json, {})
    }));
    return {
      expired: false,
      items,
      nextCursor: items.length ? items.at(-1).seq : normalizedCursor,
      oldestCursor: bounds.oldest,
      latestCursor: bounds.latest
    };
  }

  purgeOldData({ now = new Date(), signalDays = 45, operationalDays = 30 } = {}) {
    this.ensureInitialized();
    const signalCutoff = new Date(new Date(now).getTime() - signalDays * 86400000).toISOString();
    const operationalCutoff = new Date(new Date(now).getTime() - operationalDays * 86400000).toISOString();
    const transaction = this.db.transaction(() => {
      const snapshots = this.db.prepare('DELETE FROM topic_snapshots WHERE captured_at < ?').run(operationalCutoff).changes;
      const changes = this.db.prepare('DELETE FROM topic_changes WHERE changed_at < ?').run(operationalCutoff).changes;
      const runs = this.db.prepare('DELETE FROM signal_runs WHERE started_at < ?').run(operationalCutoff).changes;
      const signals = this.db.prepare(`
        DELETE FROM signals
        WHERE published_at < ?
          AND id NOT IN (SELECT signal_id FROM topic_signals)
      `).run(signalCutoff).changes;
      const topics = this.db.prepare(`
        DELETE FROM topics
        WHERE active = 0 AND latest_seen_at < ?
          AND id NOT IN (SELECT canonical_id FROM topic_aliases)
      `).run(signalCutoff).changes;
      return { snapshots, changes, runs, signals, topics };
    });
    return transaction();
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
    this.initialized = false;
  }
}

module.exports = SignalStore;
