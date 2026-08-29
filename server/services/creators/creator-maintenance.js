const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DAY_MS = 86_400_000;
const EXPORT_SCHEMA = 'aya-creator-export-v1';

function json(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function safeError(error) {
  return String(error?.message || error || 'maintenance_failed')
    .replace(/(token|secret|cookie|authorization)[^\s,;]*/gi, '[redacted]')
    .slice(0, 500);
}

function cutoff(now, days) {
  return new Date(Date.parse(now) - days * DAY_MS).toISOString();
}

function confinedPath(root, fileName, extension) {
  const base = path.resolve(root);
  const name = String(fileName || '').trim();
  if (!name || path.isAbsolute(name) || path.basename(name) !== name || name.includes('..') || !name.endsWith(extension)) {
    throw new TypeError('maintenance_path_forbidden');
  }
  const target = path.resolve(base, name);
  if (path.dirname(target) !== base) throw new TypeError('maintenance_path_forbidden');
  return target;
}

class CreatorMaintenance {
  constructor(options = {}) {
    if (!options.store?.db) throw new TypeError('initialized store required');
    this.store = options.store;
    this.now = options.now || (() => new Date().toISOString());
    this.tokenTtlMs = Math.max(Number(options.tokenTtlMs || 10 * 60_000), 10_000);
    this.backupDir = path.resolve(options.backupDir || process.env.AYA_CREATOR_BACKUP_DIR || path.join(__dirname, '../../data/backups'));
    this.exportDir = path.resolve(options.exportDir || process.env.AYA_CREATOR_EXPORT_DIR || path.join(__dirname, '../../data/exports'));
    this.afterExportRecord = options.afterExportRecord || null;
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }

  audit(input = {}) {
    const now = this.now();
    this.store.db.prepare(`
      INSERT INTO creator_maintenance_audits (
        preview_id, actor_id, action, boundaries_json, result_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.previewId || null,
      String(input.actorId || 'unknown').slice(0, 200),
      String(input.action || 'unknown').slice(0, 80),
      json(input.boundaries, {}),
      json(input.result, {}),
      input.status || 'failed',
      now
    );
  }

  policies(now) {
    return {
      bridgePayloads: { table: 'creator_bridge_payloads', timestamp: 'received_at', cutoff: cutoff(now, 30) },
      posts: { table: 'creator_posts', timestamp: 'published_at', cutoff: cutoff(now, 365) },
      metrics: {
        table: 'creator_post_metrics', timestamp: 'captured_at',
        fineCutoff: new Date(Date.parse(now) - 72 * 3_600_000).toISOString(),
        dailyCutoff: cutoff(now, 180), snapshotEntity: 'post_id'
      },
      topicSnapshots: {
        table: 'creator_topic_snapshots', timestamp: 'captured_at',
        fineCutoff: new Date(Date.parse(now) - 72 * 3_600_000).toISOString(),
        dailyCutoff: cutoff(now, 180), snapshotEntity: 'topic_id'
      },
      deliveredOutbox: { table: 'creator_delivery_outbox', timestamp: 'delivered_at', cutoff: cutoff(now, 30), where: "status = 'delivered'" },
      failedOutbox: { table: 'creator_delivery_outbox', timestamp: 'created_at', cutoff: cutoff(now, 90), where: "status IN ('retry', 'dead')" },
      events: { table: 'creator_events', timestamp: 'occurred_at', cutoff: cutoff(now, 30), where: 'NOT EXISTS (SELECT 1 FROM creator_delivery_outbox o WHERE o.event_id = creator_events.id)' },
      previews: { table: 'creator_maintenance_previews', timestamp: 'created_at', cutoff: cutoff(now, 90) },
      audits: { table: 'creator_maintenance_audits', timestamp: 'created_at', cutoff: cutoff(now, 90) }
    };
  }

  candidate(policy) {
    const maxRowid = Number(this.store.db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS value FROM ${policy.table}`).get().value || 0);
    if (policy.snapshotEntity) {
      const row = this.store.db.prepare(`
        SELECT COUNT(*) AS count, MIN(s.${policy.timestamp}) AS oldest_at, MAX(s.${policy.timestamp}) AS latest_at
        FROM ${policy.table} s
        WHERE s.rowid <= ? AND (
          s.${policy.timestamp} < ? OR (
            s.${policy.timestamp} < ? AND s.${policy.timestamp} >= ? AND EXISTS (
              SELECT 1 FROM ${policy.table} newer
              WHERE newer.rowid <= ?
                AND newer.${policy.snapshotEntity} = s.${policy.snapshotEntity}
                AND date(newer.${policy.timestamp}) = date(s.${policy.timestamp})
                AND (newer.${policy.timestamp} > s.${policy.timestamp}
                  OR (newer.${policy.timestamp} = s.${policy.timestamp} AND newer.rowid > s.rowid))
            )
          )
        )
      `).get(maxRowid, policy.dailyCutoff, policy.fineCutoff, policy.dailyCutoff, maxRowid);
      return {
        table: policy.table, timestamp: policy.timestamp, fineCutoff: policy.fineCutoff,
        dailyCutoff: policy.dailyCutoff, snapshotEntity: policy.snapshotEntity, maxRowid,
        count: Number(row.count || 0), oldestAt: row.oldest_at || null, latestAt: row.latest_at || null
      };
    }
    const where = [`rowid <= ?`, `${policy.timestamp} < ?`, policy.where].filter(Boolean).join(' AND ');
    const row = this.store.db.prepare(`
      SELECT COUNT(*) AS count, MIN(${policy.timestamp}) AS oldest_at, MAX(${policy.timestamp}) AS latest_at
      FROM ${policy.table} WHERE ${where}
    `).get(maxRowid, policy.cutoff);
    return {
      table: policy.table,
      timestamp: policy.timestamp,
      cutoff: policy.cutoff,
      maxRowid,
      where: policy.where || null,
      count: Number(row.count || 0),
      oldestAt: row.oldest_at || null,
      latestAt: row.latest_at || null
    };
  }

  previewCleanup(actorId) {
    if (!actorId) throw new TypeError('maintenance_actor_required');
    const now = this.now();
    const token = crypto.randomBytes(32).toString('base64url');
    const id = this.hashToken(token);
    const candidates = {};
    const boundaries = {};
    for (const [name, policy] of Object.entries(this.policies(now))) {
      const candidate = this.candidate(policy);
      candidates[name] = {
        count: candidate.count,
        oldestAt: candidate.oldestAt,
        latestAt: candidate.latestAt,
        irreversible: candidate.count > 0
      };
      boundaries[name] = {
        table: candidate.table,
        timestamp: candidate.timestamp,
        cutoff: candidate.cutoff,
        fineCutoff: candidate.fineCutoff,
        dailyCutoff: candidate.dailyCutoff,
        snapshotEntity: candidate.snapshotEntity,
        maxRowid: candidate.maxRowid,
        where: candidate.where
      };
    }
    const bridge = boundaries.bridgePayloads;
    const bridgeLinks = this.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM creator_bridge_payload_posts l
      JOIN creator_bridge_payloads p ON p.id = l.payload_id
      WHERE p.rowid <= ? AND p.received_at < ?
    `).get(bridge.maxRowid, bridge.cutoff);
    candidates.bridgePayloadLinks = {
      count: Number(bridgeLinks.count || 0),
      oldestAt: candidates.bridgePayloads.oldestAt,
      latestAt: candidates.bridgePayloads.latestAt,
      irreversible: Number(bridgeLinks.count || 0) > 0
    };
    const expiresAt = new Date(Date.parse(now) + this.tokenTtlMs).toISOString();
    this.store.db.prepare(`
      INSERT INTO creator_maintenance_previews (
        id, actor_id, action, boundaries_json, result_json, created_at, expires_at, consumed_at
      ) VALUES (?, ?, 'cleanup', ?, ?, ?, ?, NULL)
    `).run(id, actorId, json(boundaries), json(candidates), now, expiresAt);
    this.audit({
      previewId: id,
      actorId,
      action: 'cleanup-preview',
      boundaries,
      result: { candidates, expiresAt },
      status: 'success'
    });
    return { token, action: 'cleanup', expiresAt, candidates };
  }

  rejectExecution(actorId, previewId, code, boundaries = {}) {
    this.audit({
      previewId: previewId && this.store.db.prepare('SELECT id FROM creator_maintenance_previews WHERE id = ?').get(previewId) ? previewId : null,
      actorId, action: 'cleanup', boundaries,
      result: { error: code }, status: 'rejected'
    });
    const error = new TypeError(code);
    error.code = code;
    throw error;
  }

  executeCleanup(actorId, token) {
    if (!token) return this.rejectExecution(actorId, null, 'maintenance_preview_required');
    const id = this.hashToken(token);
    const preview = this.store.db.prepare('SELECT * FROM creator_maintenance_previews WHERE id = ?').get(id);
    if (!preview) return this.rejectExecution(actorId, null, 'maintenance_preview_missing');
    const boundaries = JSON.parse(preview.boundaries_json || '{}');
    if (preview.actor_id !== actorId || preview.action !== 'cleanup') {
      return this.rejectExecution(actorId, id, 'maintenance_preview_mismatch', boundaries);
    }
    if (preview.consumed_at) return this.rejectExecution(actorId, id, 'maintenance_preview_used', boundaries);
    if (Date.parse(preview.expires_at) <= Date.parse(this.now())) {
      return this.rejectExecution(actorId, id, 'maintenance_preview_expired', boundaries);
    }
    const deleted = {};
    const remove = (name, extraWhere = '') => {
      const boundary = boundaries[name];
      if (!boundary) throw new Error(`maintenance_boundary_missing:${name}`);
      if (boundary.snapshotEntity) {
        deleted[name] = this.store.db.prepare(`
          DELETE FROM ${boundary.table} AS s
          WHERE s.rowid <= ? AND (
            s.${boundary.timestamp} < ? OR (
              s.${boundary.timestamp} < ? AND s.${boundary.timestamp} >= ? AND EXISTS (
                SELECT 1 FROM ${boundary.table} newer
                WHERE newer.rowid <= ?
                  AND newer.${boundary.snapshotEntity} = s.${boundary.snapshotEntity}
                  AND date(newer.${boundary.timestamp}) = date(s.${boundary.timestamp})
                  AND (newer.${boundary.timestamp} > s.${boundary.timestamp}
                    OR (newer.${boundary.timestamp} = s.${boundary.timestamp} AND newer.rowid > s.rowid))
              )
            )
          )
        `).run(
          boundary.maxRowid, boundary.dailyCutoff, boundary.fineCutoff,
          boundary.dailyCutoff, boundary.maxRowid
        ).changes;
        return;
      }
      const where = [
        'rowid <= ?', `${boundary.timestamp} < ?`, boundary.where, extraWhere
      ].filter(Boolean).join(' AND ');
      deleted[name] = this.store.db.prepare(`DELETE FROM ${boundary.table} WHERE ${where}`)
        .run(boundary.maxRowid, boundary.cutoff).changes;
    };
    const transaction = this.store.db.transaction(() => {
      const consumed = this.store.db.prepare(`
        UPDATE creator_maintenance_previews SET consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
      `).run(this.now(), id, this.now());
      if (!consumed.changes) throw new Error('maintenance_preview_race');
      remove('bridgePayloads');

      const posts = boundaries.posts;
      this.store.db.prepare(`
        DELETE FROM creator_posts_fts WHERE post_id IN (
          SELECT id FROM creator_posts WHERE rowid <= ? AND published_at < ?
        )
      `).run(posts.maxRowid, posts.cutoff);
      remove('posts');
      remove('metrics');
      remove('topicSnapshots');
      // Event eligibility depends on retained outbox references. Delete the exact
      // preview-eligible events before removing outbox rows so the preview set
      // cannot expand during this execution.
      remove('events');
      remove('deliveredOutbox');
      remove('failedOutbox');
      remove('previews');
      remove('audits');
      this.audit({ previewId: id, actorId, action: 'cleanup', boundaries, result: { deleted }, status: 'success' });
    });
    try { transaction(); }
    catch (error) {
      this.audit({ previewId: id, actorId, action: 'cleanup', boundaries, result: { error: safeError(error) }, status: 'failed' });
      throw error;
    }
    return { previewId: id, deleted };
  }

  async backup(actorId, options = {}) {
    const generated = `aya-creator-${this.now().replace(/[:.]/g, '-')}.db`;
    let target;
    let ownsTarget = false;
    try {
      target = confinedPath(this.backupDir, options.fileName || generated, '.db');
      fs.mkdirSync(this.backupDir, { recursive: true });
      if (fs.existsSync(target)) throw new TypeError('maintenance_file_exists');
      ownsTarget = true;
      await this.store.db.backup(target);
      const check = new Database(target, { readonly: true, fileMustExist: true });
      const integrity = check.pragma('integrity_check', { simple: true });
      check.close();
      if (integrity !== 'ok') throw new Error(`backup_integrity_failed:${integrity}`);
      const result = { path: target, integrity, bytes: fs.statSync(target).size };
      this.audit({ actorId, action: 'backup', result: { file: path.basename(target), integrity, bytes: result.bytes }, status: 'success' });
      return result;
    } catch (error) {
      if (ownsTarget && target && fs.existsSync(target)) fs.unlinkSync(target);
      this.audit({ actorId, action: 'backup', result: { error: safeError(error) }, status: 'failed' });
      throw error;
    }
  }

  exportRows() {
    const db = this.store.db;
    return [
      ['creator', db.prepare(`SELECT id, display_name AS displayName, kind, review_status AS reviewStatus, reviewed_at AS reviewedAt, created_at AS createdAt, updated_at AS updatedAt FROM creators ORDER BY id`).all()],
      ['account', db.prepare(`SELECT id, creator_id AS creatorId, platform, external_account_id AS externalAccountId, handle, profile_url AS profileUrl, region, source_tier AS sourceTier, enabled, last_verified_at AS lastVerifiedAt, auth_state AS authState, backfill_state AS backfillState, oldest_fetched_at AS oldestFetchedAt, newest_fetched_at AS newestFetchedAt, history_limit_reason AS historyLimitReason, created_at AS createdAt, updated_at AS updatedAt FROM creator_accounts ORDER BY id`).all()],
      ['post', db.prepare(`SELECT id, account_id AS accountId, platform, external_post_id AS externalPostId, url, title, text, content_type AS contentType, published_at AS publishedAt, collected_at AS collectedAt, edited_at AS editedAt, deleted_at AS deletedAt, language, source_confidence AS sourceConfidence, provenance_url AS provenanceUrl FROM creator_posts ORDER BY published_at, id`).all()],
      ['metric', db.prepare(`SELECT id, post_id AS postId, captured_at AS capturedAt, views, likes, comments, shares, bookmarks, platform_rank AS platformRank, followers_at_capture AS followersAtCapture FROM creator_post_metrics ORDER BY captured_at, id`).all()],
      ['topic', db.prepare(`SELECT id, vertical_id AS verticalId, title, summary, first_seen_at AS firstSeenAt, latest_seen_at AS latestSeenAt, hotness, formula_version AS formulaVersion, creator_count AS creatorCount, platform_count AS platformCount FROM creator_topics ORDER BY first_seen_at, id`).all()],
      ['evidence', db.prepare(`SELECT tp.topic_id AS topicId, tp.post_id AS postId, tp.adopted_at AS adoptedAt, p.url, p.platform, p.published_at AS publishedAt FROM creator_topic_posts tp JOIN creator_posts p ON p.id = tp.post_id ORDER BY tp.topic_id, tp.adopted_at, tp.post_id`).all()]
    ];
  }

  exportJsonl(actorId, options = {}) {
    const generated = `aya-creator-${this.now().replace(/[:.]/g, '-')}.jsonl`;
    let target;
    let temporary;
    let handle;
    try {
      target = confinedPath(this.exportDir, options.fileName || generated, '.jsonl');
      fs.mkdirSync(this.exportDir, { recursive: true });
      if (fs.existsSync(target)) throw new TypeError('maintenance_file_exists');
      temporary = `${target}.tmp-${crypto.randomUUID()}`;
      handle = fs.openSync(temporary, 'wx', 0o600);
      const hash = crypto.createHash('sha256');
      let records = 0;
      const write = (value, includeInHash = true) => {
        const line = `${JSON.stringify(value)}\n`;
        fs.writeSync(handle, line);
        if (includeInHash) hash.update(line);
        records += 1;
        this.afterExportRecord?.(value, records);
      };
      const transaction = this.store.db.transaction(() => {
        const range = this.store.db.prepare('SELECT MIN(published_at) AS oldest, MAX(published_at) AS latest FROM creator_posts').get();
        write({ type: 'manifest', schemaVersion: EXPORT_SCHEMA, createdAt: this.now(), timeRange: { oldest: range.oldest || null, latest: range.latest || null } });
        for (const [type, rows] of this.exportRows()) {
          for (const data of rows) write({ type, data });
        }
      });
      transaction.deferred();
      const digest = hash.digest('hex');
      write({ type: 'checksum', algorithm: 'sha256', sha256: digest, dataRecords: records }, false);
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      fs.renameSync(temporary, target);
      const result = { path: target, sha256: digest, records, bytes: fs.statSync(target).size, schemaVersion: EXPORT_SCHEMA };
      this.audit({ actorId, action: 'export', result: { file: path.basename(target), sha256: digest, records, bytes: result.bytes }, status: 'success' });
      return result;
    } catch (error) {
      if (handle !== undefined && handle !== null) {
        try { fs.closeSync(handle); } catch {}
      }
      if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
      this.audit({ actorId, action: 'export', result: { error: safeError(error) }, status: 'failed' });
      throw error;
    }
  }
}

module.exports = CreatorMaintenance;
module.exports.confinedPath = confinedPath;
module.exports.EXPORT_SCHEMA = EXPORT_SCHEMA;
