const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.join(__dirname, '../..');
const baselinePath = path.join(
  repositoryRoot,
  'docs/verification/2026-08-28-creator-intelligence-baseline.md'
);

const protectedFiles = new Map([
  ['server/routes/news.js', 'a71af612c2d50bee52109c780e4ffad337c92d58b53a404ec719788cbe808cb3'],
  ['server/routes/signals.js', '30565ae98ac5e92457d0f4c4cd6488af36322bf97a86c954b700202a20eaf0ec'],
  ['server/routes/auth.js', '916f26a6ea6decfe5bc76468c642fcdc451a4a534cc847bd0942f84467dcbedd'],
  ['server/routes/userData.js', '0ceee502ff8a592d2e8c536b257c220e40bdf0dc3b66ca4ac4225a18813a427a'],
  ['server/services/DatabaseService.js', 'de835bf3faa29f0ab59c663bb363b2ab11ede9550f0dbda2b6d58bd5c924fd9c']
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('creator intelligence baseline manifest is present', () => {
  assert.equal(
    fs.existsSync(baselinePath),
    true,
    'Create the non-secret Phase 4 baseline manifest before implementation'
  );
});

test('protected legacy route and database files match the frozen baseline', () => {
  for (const [relativePath, expectedHash] of protectedFiles) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    assert.equal(sha256(absolutePath), expectedHash, `${relativePath} changed outside the approved boundary`);
  }
});

test('server lifecycle retains legacy routes and services', () => {
  const indexSource = fs.readFileSync(path.join(repositoryRoot, 'server/index.js'), 'utf8');
  for (const marker of [
    "app.use('/api/news'",
    "app.use('/api/auth'",
    "app.use('/api/user-data'",
    "app.use('/api/signals/v1'",
    'initializeSystem',
    'registerCronJobs',
    'shutdown',
    'startServer'
  ]) {
    assert.match(indexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('legacy news and user tables remain declared', () => {
  const databaseSource = fs.readFileSync(
    path.join(repositoryRoot, 'server/services/DatabaseService.js'),
    'utf8'
  );
  for (const table of [
    'news',
    'rss_sources',
    'user_preferences',
    'users',
    'auth_sessions',
    'user_favorites',
    'user_read_history',
    'system_config',
    'diversity_audits',
    'request_logs'
  ]) {
    assert.match(databaseSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test('baseline document records every protected file hash', () => {
  const document = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8') : '';
  for (const [relativePath, hash] of protectedFiles) {
    assert.match(document, new RegExp(`${relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${hash}`));
  }
});
