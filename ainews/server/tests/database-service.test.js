const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-db-'));
process.env.AINEWS_DB_PATH = path.join(tmpDir, 'test.db');

process.on('exit', () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const DatabaseService = require('../services/DatabaseService');

test('DatabaseService initializes and persists news entries', async () => {
  await DatabaseService.initialize();

  const saved = await DatabaseService.saveNews([
    {
      id: 'news-1',
      title: 'Test article',
      description: 'desc',
      url: 'https://example.com/a',
      publishedAt: new Date('2026-04-03T00:00:00Z').toISOString(),
      category: 'AI新闻',
      source: 'Test Source',
      imageUrl: null,
      author: 'Tester'
    }
  ]);

  assert.equal(saved, 1);
  assert.equal(await DatabaseService.getNewsCount(), 1);
  assert.deepEqual(await DatabaseService.all('SELECT title, source FROM news'), [
    { title: 'Test article', source: 'Test Source' }
  ]);

  await DatabaseService.close();
});

test('DatabaseService updates an existing URL instead of duplicating it after 24 hours', async () => {
  await DatabaseService.initialize();

  const saved = await DatabaseService.saveNews([
    {
      id: 'news-duplicate',
      title: 'Updated article title',
      description: 'A substantially updated description',
      url: 'https://example.com/a',
      publishedAt: new Date('2026-04-06T00:00:00Z').toISOString(),
      category: '新思路',
      source: 'Test Source',
      imageUrl: 'https://example.com/a.jpg',
      author: 'Updated Author'
    }
  ]);

  assert.equal(saved, 0);
  assert.equal(await DatabaseService.getNewsCount(), 1);
  assert.deepEqual(
    await DatabaseService.get('SELECT id, title, category FROM news WHERE url = ?', ['https://example.com/a']),
    { id: 'news-1', title: 'Updated article title', category: '新思路' }
  );

  await DatabaseService.close();
});

test('DatabaseService statistics count a duplicated historical URL only once', async () => {
  await DatabaseService.initialize();
  await DatabaseService.run(
    `INSERT INTO news
      (id, title, description, url, published_at, category, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'news-legacy-copy',
      'Legacy copy',
      'old data',
      'https://example.com/a',
      '2026-04-03T00:00:00.000Z',
      'AI新闻',
      'Legacy Source'
    ]
  );

  assert.equal(await DatabaseService.getNewsCount(), 1);
  assert.equal((await DatabaseService.getCategoryStats()).reduce((sum, row) => sum + row.count, 0), 1);
  assert.equal((await DatabaseService.getSourceStats()).reduce((sum, row) => sum + row.count, 0), 1);

  await DatabaseService.close();
});

test('DatabaseService updateRssSourceStatus accepts boolean success flags', async () => {
  await DatabaseService.initialize();

  await DatabaseService.updateRssSourceStatus(
    'Test Feed',
    'https://example.com/feed.xml',
    true,
    null
  );

  const row = await DatabaseService.get(
    'SELECT name, fail_count, is_active FROM rss_sources WHERE name = ?',
    ['Test Feed']
  );

  assert.deepEqual(row, {
    name: 'Test Feed',
    fail_count: 0,
    is_active: 1
  });

  await DatabaseService.close();
});

test('DatabaseService resetFailedSources works after reconnecting', async () => {
  await DatabaseService.initialize();
  await DatabaseService.updateRssSourceStatus(
    'Recoverable Feed',
    'https://example.com/feed.xml',
    false,
    'boom'
  );
  await DatabaseService.close();

  await DatabaseService.resetFailedSources();

  const row = await DatabaseService.get(
    'SELECT name, fail_count, is_active, error_message FROM rss_sources WHERE name = ?',
    ['Recoverable Feed']
  );

  assert.deepEqual(row, {
    name: 'Recoverable Feed',
    fail_count: 0,
    is_active: 1,
    error_message: null
  });

  await DatabaseService.close();
});

test('DatabaseService enables foreign keys and isolates favorites by user', async () => {
  await DatabaseService.initialize();
  await DatabaseService.createUser({
    id: 'user-a',
    email: 'a@example.com',
    passwordHash: 'hash-a',
    displayName: 'A'
  });
  await DatabaseService.createUser({
    id: 'user-b',
    email: 'b@example.com',
    passwordHash: 'hash-b',
    displayName: 'B'
  });

  assert.equal((await DatabaseService.get('PRAGMA foreign_keys')).foreign_keys, 1);

  await DatabaseService.upsertUserFavorite('user-a', {
    id: 'saved-news',
    title: '只属于 A 的收藏',
    url: 'https://example.com/saved',
    source: 'Test Source',
    category: 'AI新闻'
  });

  assert.equal((await DatabaseService.getUserFavorites('user-a')).length, 1);
  assert.deepEqual(await DatabaseService.getUserFavorites('user-b'), []);

  await DatabaseService.close();
});

test('DatabaseService persists bounded read history per user and keeps favorite snapshots', async () => {
  await DatabaseService.initialize();

  await DatabaseService.markUserNewsRead('user-a', 'saved-news', 1000);
  await DatabaseService.markUserNewsRead('user-a', 'saved-news', 2000);
  await DatabaseService.markUserNewsRead('user-b', 'saved-news', 3000);

  assert.deepEqual(await DatabaseService.getUserReadHistory('user-a'), [
    { id: 'saved-news', readAt: 2000, readCount: 2 }
  ]);
  assert.deepEqual(await DatabaseService.getUserReadHistory('user-b'), [
    { id: 'saved-news', readAt: 3000, readCount: 1 }
  ]);

  await DatabaseService.run('DELETE FROM news WHERE id = ?', ['news-1']);
  assert.equal((await DatabaseService.getUserFavorites('user-a'))[0].title, '只属于 A 的收藏');

  await DatabaseService.close();
});

test('DatabaseService persists and restores the latest daily diversity audit', async () => {
  await DatabaseService.initialize();
  await DatabaseService.saveDiversityAudit({
    auditDate: '2026-08-08',
    status: 'verified',
    score: 78,
    riskLevel: 'low',
    model: 'MiniMax-M2.5',
    summary: '国内外与多种证据类型均有覆盖 [S1]。',
    sources: [{ citationId: 'S1', title: 'Test source', url: 'https://example.com/source' }]
  });

  const audit = await DatabaseService.getLatestDiversityAudit();

  assert.equal(audit.auditDate, '2026-08-08');
  assert.equal(audit.status, 'verified');
  assert.equal(audit.score, 78);
  assert.deepEqual(audit.sources, [{ citationId: 'S1', title: 'Test source', url: 'https://example.com/source' }]);
  await DatabaseService.close();
});
