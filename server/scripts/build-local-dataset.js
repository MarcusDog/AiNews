#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function count(db, table, where = '1=1') {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get().count || 0);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function backupDatabase(sourcePath, targetPath) {
  const source = path.resolve(sourcePath);
  const target = path.resolve(targetPath);
  if (source === target) throw new Error('source and target database paths must differ');
  if (!fs.existsSync(source)) throw new Error(`source database not found: ${source}`);
  if (fs.existsSync(target)) throw new Error(`target database already exists: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }
  const copied = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const integrity = copied.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`copied database integrity check failed: ${integrity}`);
  } finally {
    copied.close();
  }
  return target;
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function datasetReport(db, options = {}) {
  const verticals = tableExists(db, 'creator_verticals')
    ? db.prepare(`
      SELECT v.id,
        (SELECT COUNT(*) FROM creator_vertical_memberships m WHERE m.vertical_id=v.id) AS creators,
        (SELECT COUNT(*) FROM creator_post_verticals p WHERE p.vertical_id=v.id) AS posts
      FROM creator_verticals v ORDER BY v.id
    `).all().map((row) => ({ id: row.id, creators: Number(row.creators), posts: Number(row.posts) }))
    : [];
  const newsRange = tableExists(db, 'news')
    ? db.prepare('SELECT MIN(published_at) AS oldest, MAX(published_at) AS latest FROM news').get()
    : { oldest: null, latest: null };
  const postRange = tableExists(db, 'creator_posts')
    ? db.prepare('SELECT MIN(published_at) AS oldest, MAX(published_at) AS latest FROM creator_posts').get()
    : { oldest: null, latest: null };
  const newsUrlSample = tableExists(db, 'news')
    ? db.prepare('SELECT url FROM news WHERE url IS NOT NULL ORDER BY published_at DESC LIMIT 100').all()
    : [];
  const postUrlSample = tableExists(db, 'creator_posts')
    ? db.prepare('SELECT url, provenance_url FROM creator_posts ORDER BY published_at DESC LIMIT 100').all()
    : [];
  const newsSources = tableExists(db, 'news')
    ? db.prepare('SELECT source, COUNT(*) AS count FROM news GROUP BY source ORDER BY count DESC, source LIMIT 100').all()
    : [];
  const platforms = tableExists(db, 'creator_posts')
    ? db.prepare('SELECT platform, COUNT(*) AS count FROM creator_posts GROUP BY platform ORDER BY count DESC, platform').all()
    : [];
  return {
    schemaVersion: 'aya-local-dataset-v1',
    generatedAt: new Date().toISOString(),
    databaseFile: options.databasePath ? path.basename(options.databasePath) : null,
    databaseSha256: options.databasePath && fs.existsSync(options.databasePath) ? sha256(options.databasePath) : null,
    counts: {
      news: count(db, 'news'),
      validNews: count(db, 'news', "title IS NOT NULL AND length(trim(title)) > 0 AND url LIKE 'https://%'"),
      signals: count(db, 'signals'),
      signalTopics: count(db, 'topics'),
      creators: count(db, 'creators', "review_status='verified'"),
      creatorAccounts: count(db, 'creator_accounts', 'enabled=1'),
      creatorPosts: count(db, 'creator_posts', 'deleted_at IS NULL'),
      creatorScores: count(db, 'creator_post_scores'),
      creatorTopics: count(db, 'creator_topics')
    },
    timeRanges: { news: newsRange, creatorPosts: postRange },
    verticals,
    newsSources: newsSources.map((row) => ({ source: row.source || 'unknown', count: Number(row.count) })),
    creatorPlatforms: platforms.map((row) => ({ platform: row.platform, count: Number(row.count) })),
    urlValidation: {
      newsChecked: newsUrlSample.length,
      newsValidHttps: newsUrlSample.filter((row) => safeHttps(row.url)).length,
      newsValidWeb: newsUrlSample.filter((row) => safeWebUrl(row.url)).length,
      creatorChecked: postUrlSample.length,
      creatorValidHttps: postUrlSample.filter((row) => safeHttps(row.url) && safeHttps(row.provenance_url)).length
    }
  };
}

function assertDatasetGates(report, options = {}) {
  const minimumNews = Number(options.minimumNews ?? 10000);
  const minimumCreators = Number(options.minimumCreators ?? 100);
  const minimumAccounts = Number(options.minimumAccounts ?? 100);
  const minimumPosts = Number(options.minimumPosts ?? 1);
  const requiredVerticals = options.requiredVerticals || ['beauty', 'fashion', 'ai-tech', 'entertainment'];
  const failures = [];
  if (report.counts.news < minimumNews) failures.push(`news ${report.counts.news} < ${minimumNews}`);
  if (report.counts.validNews < Math.min(minimumNews, report.counts.news)) failures.push('news HTTPS/title provenance gate failed');
  if (report.counts.creators < minimumCreators) failures.push(`creators ${report.counts.creators} < ${minimumCreators}`);
  if (report.counts.creatorAccounts < minimumAccounts) failures.push(`creator accounts ${report.counts.creatorAccounts} < ${minimumAccounts}`);
  if (report.counts.creatorPosts < minimumPosts) failures.push(`creator posts ${report.counts.creatorPosts} < ${minimumPosts}`);
  for (const verticalId of requiredVerticals) {
    const vertical = report.verticals.find((item) => item.id === verticalId);
    if (!vertical || vertical.creators === 0 || vertical.posts === 0) failures.push(`${verticalId} has no creator content`);
  }
  if (report.urlValidation.newsChecked && (report.urlValidation.newsValidWeb ?? report.urlValidation.newsValidHttps) !== report.urlValidation.newsChecked) {
    failures.push('sampled news URLs are not safe HTTP(S) evidence');
  }
  if (report.urlValidation.creatorChecked && report.urlValidation.creatorValidHttps !== report.urlValidation.creatorChecked) {
    failures.push('sampled creator URLs are not canonical HTTPS');
  }
  if (failures.length) throw new Error(`dataset gates failed: ${failures.join('; ')}`);
  return report;
}

function countValues(items, field, fallback = 'unknown') {
  return items.reduce((counts, item) => {
    const value = String(item?.[field] || fallback);
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function summarizeCreatorRun(result) {
  if (!result || result.status === 'skipped') return result || null;
  const incremental = Array.isArray(result.incremental) ? result.incremental : [];
  const backfill = Array.isArray(result.backfill) ? result.backfill : [];
  return {
    status: result.status || 'unknown',
    incremental: {
      accounts: incremental.length,
      statusCounts: countValues(incremental, 'status'),
      collectedPosts: incremental.reduce((sum, item) => sum + (Array.isArray(item.posts) ? item.posts.length : 0), 0),
      insertedPosts: incremental.reduce((sum, item) => sum + Number(item.commit?.inserted || 0), 0),
      updatedPosts: incremental.reduce((sum, item) => sum + Number(item.commit?.updated || 0), 0)
    },
    backfill: {
      accounts: backfill.length,
      statusCounts: countValues(backfill, 'status'),
      reasonCounts: countValues(backfill.filter((item) => item?.reason), 'reason')
    },
    intelligence: result.intelligence || null,
    remainingBudget: Number.isFinite(Number(result.remainingBudget)) ? Number(result.remainingBudget) : null
  };
}

async function buildLocalDataset(options = {}) {
  const sourcePath = path.resolve(options.sourcePath);
  const targetPath = path.resolve(options.targetPath);
  const workingPath = `${targetPath}.building-${process.pid}`;
  const seedsPath = path.resolve(options.seedsPath);
  await backupDatabase(sourcePath, workingPath);
  process.env.AINEWS_DB_PATH = workingPath;
  process.env.AYA_CREATOR_SEEDS_PATH = seedsPath;
  process.env.AYA_CREATOR_REQUEST_BUDGET = String(options.requestBudget || 500);

  const CreatorStore = require('../services/creators/creator-store');
  const CreatorService = require('../services/creators/creator-service');
  const { CreatorSourceRegistry } = require('../services/creators/creator-source-registry');
  const SignalService = require('../services/signals/signal-service');
  const { buildSignalSourceCatalog } = require('../config/signalSources');
  const store = new CreatorStore({ dbPath: workingPath }).initialize();
  let creatorResult;
  let signalResult;
  try {
    const env = { ...process.env, AINEWS_DB_PATH: workingPath, AYA_CREATOR_SEEDS_PATH: seedsPath };
    const creatorService = new CreatorService({
      store,
      env,
      sourceRegistry: new CreatorSourceRegistry({ env })
    }).initialize();
    creatorResult = options.skipCollection ? { status: 'skipped' } : await creatorService.tick();

    const newsProvider = async ({ limit }) => ({
      data: store.db.prepare(`
        SELECT id, title, description, url, published_at AS publishedAt, category, source, author
        FROM news ORDER BY published_at DESC LIMIT ?
      `).all(limit)
    });
    const signalService = new SignalService({
      env,
      catalog: buildSignalSourceCatalog(env),
      storeOptions: { dbPath: workingPath },
      newsProvider
    });
    signalResult = options.skipCollection
      ? { collection: { status: 'skipped' }, rebuild: signalService.rebuildTopics({ windowHours: 72 }) }
      : await signalService.refreshAll({ itemLimit: Number(options.signalLimit || 40), windowHours: 72 });
    signalService.close();
    store.db.pragma('wal_checkpoint(TRUNCATE)');
    const report = datasetReport(store.db, { databasePath: workingPath });
    report.runs = {
      creator: summarizeCreatorRun(creatorResult),
      signal: signalResult ? {
        collection: signalResult.collection,
        rebuild: signalResult.rebuild && {
          signalCount: signalResult.rebuild.signalCount,
          topicCount: signalResult.rebuild.topicCount,
          aliasCount: signalResult.rebuild.aliasCount
        }
      } : null
    };
    assertDatasetGates(report, options.gates);
    store.close();
    if (fs.existsSync(targetPath)) {
      fs.renameSync(targetPath, `${targetPath}.previous-${Date.now()}`);
    }
    fs.renameSync(workingPath, targetPath);
    report.databaseFile = path.basename(targetPath);
    report.databaseSha256 = sha256(targetPath);
    return report;
  } catch (error) {
    store.close();
    throw error;
  }
}

async function main() {
  const sourcePath = process.env.AYA_DATASET_SOURCE_DB || path.join(__dirname, '../data/ainews.db');
  const targetPath = process.env.AYA_DATASET_TARGET_DB || path.join(__dirname, '../data/local-production-ready.db');
  const seedsPath = process.env.AYA_CREATOR_SEEDS_PATH || path.join(__dirname, '../config/creatorBenchmarks.json');
  const reportPath = process.env.AYA_DATASET_REPORT || path.join(__dirname, '../data/reports/local-production-ready.json');
  const report = await buildLocalDataset({ sourcePath, targetPath, seedsPath });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { assertDatasetGates, backupDatabase, buildLocalDataset, datasetReport, safeWebUrl, summarizeCreatorRun };
