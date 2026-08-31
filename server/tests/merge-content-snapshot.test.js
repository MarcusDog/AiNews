const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const { mergeContentSnapshot } = require('../scripts/merge-content-snapshot');

function fixture(file, values) {
  const db = new Database(file);
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE news (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT);
    CREATE TABLE creator_verticals (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE creators (id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE creator_accounts (
      id TEXT PRIMARY KEY, creator_id TEXT NOT NULL,
      FOREIGN KEY(creator_id) REFERENCES creators(id)
    );
  `);
  for (const user of values.users || []) db.prepare('INSERT INTO users VALUES (?, ?)').run(user.id, user.email);
  for (const news of values.news || []) db.prepare('INSERT INTO news VALUES (?, ?, ?)').run(news.id, news.title, news.url);
  for (const creator of values.creators || []) {
    db.prepare('INSERT INTO creators VALUES (?, ?)').run(creator.id, creator.name);
    db.prepare('INSERT INTO creator_accounts VALUES (?, ?)').run(creator.accountId, creator.id);
  }
  db.close();
}

test('content snapshot merge upserts content while preserving production users', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-merge-snapshot-'));
  const live = path.join(directory, 'live.db');
  const snapshot = path.join(directory, 'snapshot.db');
  fixture(live, {
    users: [{ id: 'production-user', email: 'keep@example.com' }],
    news: [{ id: 'same', title: 'old', url: 'https://example.com/old' }]
  });
  fixture(snapshot, {
    users: [{ id: 'local-user', email: 'never-import@example.com' }],
    news: [
      { id: 'same', title: 'updated', url: 'https://example.com/updated' },
      { id: 'new', title: 'new', url: 'https://example.com/new' }
    ],
    creators: [{ id: 'creator-1', name: 'Creator One', accountId: 'youtube:one' }]
  });

  const report = await mergeContentSnapshot({ livePath: live, snapshotPath: snapshot });
  const db = new Database(live, { readonly: true });
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), [
    { id: 'production-user', email: 'keep@example.com' }
  ]);
  assert.deepEqual(db.prepare('SELECT id, title FROM news ORDER BY id').all(), [
    { id: 'new', title: 'new' }, { id: 'same', title: 'updated' }
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM creators').get().count, 1);
  assert.equal(db.prepare('PRAGMA integrity_check').pluck().get(), 'ok');
  db.close();
  assert.equal(report.preserved.users.before, 1);
  assert.equal(report.preserved.users.after, 1);
  assert.equal(report.tables.news.after, 2);
});
