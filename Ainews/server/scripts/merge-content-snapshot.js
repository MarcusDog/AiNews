#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const CONTENT_TABLES = Object.freeze([
  'news',
  'signal_sources', 'signal_runs', 'signals', 'topics', 'topic_aliases',
  'topic_signals', 'topic_snapshots', 'topic_changes',
  'creator_verticals', 'creators', 'creator_accounts', 'creator_vertical_memberships',
  'creator_posts', 'creator_post_verticals', 'creator_post_metrics', 'creator_post_scores',
  'creator_cursors', 'creator_backfills', 'creator_topics', 'creator_topic_posts',
  'creator_topic_snapshots'
]);

const PRESERVED_TABLES = Object.freeze([
  'users', 'auth_sessions', 'user_preferences', 'user_favorites', 'user_read_history',
  'creator_subscriptions', 'creator_delivery_endpoints', 'creator_subscription_endpoints',
  'creator_events', 'creator_delivery_outbox', 'creator_delivery_attempts', 'contacts'
]);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableExists(db, schema, table) {
  return Boolean(db.prepare(
    `SELECT 1 FROM ${quoteIdentifier(schema)}.sqlite_master WHERE type='table' AND name=?`
  ).get(table));
}

function tableCount(db, schema, table) {
  if (!tableExists(db, schema, table)) return null;
  return Number(db.prepare(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
  ).get().count || 0);
}

function tableColumns(db, schema, table) {
  return db.prepare(`PRAGMA ${quoteIdentifier(schema)}.table_info(${quoteIdentifier(table)})`).all();
}

function mergeTable(db, table) {
  if (!tableExists(db, 'main', table) || !tableExists(db, 'incoming', table)) {
    return { status: 'skipped', reason: 'table_missing' };
  }
  const targetColumns = tableColumns(db, 'main', table);
  const incomingNames = new Set(tableColumns(db, 'incoming', table).map((column) => column.name));
  const columns = targetColumns.map((column) => column.name).filter((name) => incomingNames.has(name));
  const primary = targetColumns.filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk).map((column) => column.name);
  if (!columns.length || !primary.length || primary.some((name) => !incomingNames.has(name))) {
    return { status: 'skipped', reason: 'incompatible_schema' };
  }
  const updateColumns = columns.filter((name) => !primary.includes(name));
  const columnSql = columns.map(quoteIdentifier).join(', ');
  const conflictSql = primary.map(quoteIdentifier).join(', ');
  const actionSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((name) => `${quoteIdentifier(name)}=excluded.${quoteIdentifier(name)}`).join(', ')}`
    : 'DO NOTHING';
  const before = tableCount(db, 'main', table);
  const incoming = tableCount(db, 'incoming', table);
  const result = db.prepare(`
    INSERT INTO main.${quoteIdentifier(table)} (${columnSql})
    SELECT ${columnSql} FROM incoming.${quoteIdentifier(table)} WHERE 1
    ON CONFLICT (${conflictSql}) ${actionSql}
  `).run();
  return {
    status: 'merged', incoming, before,
    after: tableCount(db, 'main', table),
    changedRows: Number(result.changes || 0)
  };
}

async function mergeContentSnapshot(options = {}) {
  const livePath = path.resolve(options.livePath || '');
  const snapshotPath = path.resolve(options.snapshotPath || '');
  if (!fs.existsSync(livePath)) throw new Error(`live database not found: ${livePath}`);
  if (!fs.existsSync(snapshotPath)) throw new Error(`snapshot database not found: ${snapshotPath}`);
  if (livePath === snapshotPath) throw new Error('live and snapshot database paths must differ');
  const backupPath = path.resolve(options.backupPath || `${livePath}.pre-content-merge-${Date.now()}.bak`);
  if (fs.existsSync(backupPath)) throw new Error(`backup path already exists: ${backupPath}`);

  const db = new Database(livePath, { fileMustExist: true });
  try {
    db.pragma('journal_mode=WAL');
    db.pragma('foreign_keys=ON');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('live database integrity check failed');
    await db.backup(backupPath);
    db.prepare('ATTACH DATABASE ? AS incoming').run(snapshotPath);
    try {
      const incomingIntegrity = db.prepare('PRAGMA incoming.integrity_check').pluck().get();
      if (incomingIntegrity !== 'ok') throw new Error(`snapshot integrity check failed: ${incomingIntegrity}`);
      const preserved = Object.fromEntries(PRESERVED_TABLES.map((table) => [table, {
        before: tableCount(db, 'main', table)
      }]));
      const tables = {};
      db.transaction(() => {
        for (const table of CONTENT_TABLES) tables[table] = mergeTable(db, table);
      })();
      for (const [table, counts] of Object.entries(preserved)) counts.after = tableCount(db, 'main', table);
      const changedPreserved = Object.entries(preserved).filter(([, value]) => value.before !== value.after);
      if (changedPreserved.length) {
        throw new Error(`preserved table counts changed: ${changedPreserved.map(([table]) => table).join(', ')}`);
      }
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('merged database integrity check failed');
      return {
        schemaVersion: 'aya-content-merge-v1',
        generatedAt: new Date().toISOString(),
        livePath,
        snapshotPath,
        backupPath,
        tables,
        preserved
      };
    } finally {
      db.exec('DETACH DATABASE incoming');
    }
  } finally {
    db.close();
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const livePath = argument('--live') || process.env.AINEWS_DB_PATH;
  const snapshotPath = argument('--snapshot') || process.env.AYA_DATASET_SNAPSHOT;
  if (!livePath || !snapshotPath) throw new Error('Usage: merge-content-snapshot.js --live LIVE.db --snapshot SNAPSHOT.db');
  const report = await mergeContentSnapshot({ livePath, snapshotPath });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = argument('--report') || process.env.AYA_CONTENT_MERGE_REPORT;
  if (reportPath) {
    const resolved = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized);
  }
  process.stdout.write(serialized);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { CONTENT_TABLES, PRESERVED_TABLES, mergeContentSnapshot };
