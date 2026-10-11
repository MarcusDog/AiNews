const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const CreatorStore = require('../services/creators/creator-store');
const CreatorService = require('../services/creators/creator-service');
const {
  assertDatasetGates,
  backupDatabase,
  datasetReport,
  safeWebUrl,
  summarizeCreatorRun
} = require('../scripts/build-local-dataset');

test('dataset provenance accepts safe public web evidence and rejects executable URLs', () => {
  assert.equal(safeWebUrl('https://example.com/evidence'), true);
  assert.equal(safeWebUrl('http://example.com/original-rss-link'), true);
  assert.equal(safeWebUrl('javascript:alert(1)'), false);
  assert.equal(safeWebUrl('https://user:secret@example.com/private'), false);
});

test('creator collection report keeps aggregate evidence without embedding post bodies', () => {
  const summary = summarizeCreatorRun({
    status: 'success',
    incremental: [{
      status: 'success',
      posts: [{ id: 'post-1', title: 'private-sized raw payload', text: 'must not be copied' }],
      commit: { inserted: 1, updated: 0 }
    }, {
      status: 'failed',
      posts: [],
      error: 'request failed'
    }],
    backfill: [{ status: 'partial', reason: 'youtube_data_api_key_required_for_full_history' }],
    intelligence: { scored: 1, topics: 1 },
    remainingBudget: 42
  });

  assert.deepEqual(summary.incremental, {
    accounts: 2,
    statusCounts: { failed: 1, success: 1 },
    collectedPosts: 1,
    insertedPosts: 1,
    updatedPosts: 0
  });
  assert.deepEqual(summary.backfill, {
    accounts: 1,
    statusCounts: { partial: 1 },
    reasonCounts: { youtube_data_api_key_required_for_full_history: 1 }
  });
  assert.equal(JSON.stringify(summary).includes('private-sized raw payload'), false);
});

test('dataset builder preserves news, imports creators idempotently and enforces evidence gates', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-local-dataset-test-'));
  const sourcePath = path.join(directory, 'source.db');
  const targetPath = path.join(directory, 'target.db');
  const source = new Database(sourcePath);
  source.exec('CREATE TABLE news (id TEXT PRIMARY KEY, title TEXT, url TEXT, published_at TEXT, source TEXT)');
  const insert = source.prepare('INSERT INTO news VALUES (?, ?, ?, ?, ?)');
  for (let index = 0; index < 5; index += 1) {
    insert.run(`news-${index}`, `News ${index}`, `https://example.com/news/${index}`, new Date().toISOString(), 'test-source');
  }
  source.close();

  await backupDatabase(sourcePath, targetPath);
  const store = new CreatorStore({ dbPath: targetPath }).initialize();
  const env = {
    AYA_CREATOR_SEEDS_PATH: path.join(__dirname, '..', 'config', 'creatorSeeds.example.json'),
    AYA_DISABLE_CREATOR_SCHEDULER: '1'
  };
  new CreatorService({ store, env, processor: null, collector: {} }).initialize();
  new CreatorService({ store, env, processor: null, collector: {} }).initialize();
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM creators').get().count, 10);

  const accounts = store.db.prepare(`
    SELECT a.*, m.vertical_id FROM creator_accounts a
    JOIN creator_vertical_memberships m ON m.creator_id = a.creator_id
    GROUP BY m.vertical_id
  `).all();
  for (const [index, account] of accounts.entries()) {
    store.commitPage({
      accountId: account.id,
      cursorKind: 'test',
      collectedAt: new Date().toISOString(),
      exhausted: true,
      posts: [{
        id: `post-${index}`,
        externalPostId: `external-${index}`,
        accountId: account.id,
        creatorId: account.creator_id,
        platform: account.platform,
        url: `https://example.com/posts/${index}`,
        provenanceUrl: `https://example.com/feed/${index}`,
        title: `Post ${index}`,
        text: `Evidence ${index}`,
        contentType: 'article',
        publishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        language: 'en',
        sourceConfidence: 'official',
        verticalIds: [account.vertical_id],
        metrics: null,
        metadata: {}
      }]
    });
  }
  const report = datasetReport(store.db, { databasePath: targetPath });
  assert.equal(report.counts.news, 5);
  assert.equal(report.counts.creators, 10);
  assert.equal(report.counts.creatorPosts, 4);
  assert.doesNotThrow(() => assertDatasetGates(report, {
    minimumNews: 5,
    minimumCreators: 8,
    minimumAccounts: 8,
    minimumPosts: 1,
    requiredVerticals: ['beauty', 'fashion', 'ai-tech', 'entertainment']
  }));
  assert.throws(() => assertDatasetGates(report, { minimumNews: 6 }), /news/);
  store.close();
});
