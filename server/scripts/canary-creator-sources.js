#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const CreatorService = require('../services/creators/creator-service');
const { CreatorSourceRegistry } = require('../services/creators/creator-source-registry');
const { createConnectorFetch } = require('../services/creators/connectors/connector-utils');

const SOURCE_BY_PLATFORM = Object.freeze({
  youtube: 'youtube-atom',
  bluesky: 'bluesky-author-feed',
  mastodon: 'mastodon-account',
  github: 'github-creator',
  rss: 'rss-creator',
  reddit: 'reddit-user-submitted',
  x: 'x-user-timeline',
  instagram: 'instagram-business-discovery',
  douyin: 'douyin-authorized-account'
});

function parseArgs(argv = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new TypeError(`Unexpected argument: ${key}`);
    if (key === '--help') {
      values.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`${key} requires a value`);
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

function classifyCanarySource(source, attempts = []) {
  if (!source?.configured) return 'unconfigured';
  if (attempts.length === 0) return 'not_attempted_no_verified_seed';
  if (attempts.some((item) => item.status === 'success' && item.posts?.length > 0)) return 'online';
  if (attempts.some((item) => item.status === 'success')) return 'online_zero_result';
  if (attempts.some((item) => ['blocked', 'permission_missing', 'auth_expired'].includes(item.status))) {
    return 'blocked';
  }
  if (attempts.every((item) => item.status === 'unconfigured')) return 'unconfigured';
  return 'degraded';
}

function summarizeStoredAccount(rows, firstPass = {}, replay = {}) {
  const times = rows.map((row) => row.published_at).filter(Boolean).sort();
  return {
    stored: rows.length,
    firstPassInserted: Number(firstPass.inserted || 0),
    firstPassUpdated: Number(firstPass.updated || 0),
    replayInserted: Number(replay.inserted || 0),
    replayUpdated: Number(replay.updated || 0),
    duplicateSafe: Number(replay.inserted || 0) === 0,
    oldestPublishedAt: times[0] || null,
    latestPublishedAt: times[times.length - 1] || null,
    originalUrlSample: rows[0]?.url || null
  };
}

function safeOriginalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function validateStoredUrls(rows = []) {
  let validHttps = 0;
  for (const row of rows) {
    if (safeOriginalUrl(row.url) && safeOriginalUrl(row.provenance_url)) validHttps += 1;
  }
  return { checked: rows.length, validHttps, invalid: rows.length - validHttps };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function probeOriginalUrls(rows, maximum = 12) {
  const fetchImpl = createConnectorFetch();
  const unique = [...new Set(rows.map((row) => row.url).filter((value) => safeOriginalUrl(value)))]
    .slice(0, Math.max(0, maximum));
  return mapLimit(unique, 4, async (url) => {
    const started = Date.now();
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'AyaNews-Creator-Canary/2.4', range: 'bytes=0-0' },
        signal: AbortSignal.timeout(12000)
      });
      await response.body?.cancel?.();
      return {
        url,
        status: response.status,
        openable: response.status >= 200 && response.status < 400,
        finalUrl: response.url,
        latencyMs: Date.now() - started
      };
    } catch (error) {
      return { url, status: null, openable: false, error: error.message, latencyMs: Date.now() - started };
    }
  });
}

function storedRowsForAccount(store, accountId) {
  return store.db.prepare(`
    SELECT url, provenance_url, published_at
    FROM creator_posts
    WHERE account_id = ?
    ORDER BY published_at ASC, id ASC
  `).all(accountId);
}

async function runCanary(options = {}) {
  const generatedAt = new Date().toISOString();
  const temporaryDirectory = options.database
    ? null
    : fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-canary-'));
  const database = path.resolve(options.database || path.join(temporaryDirectory, 'creator-canary.db'));
  const seeds = path.resolve(options.seeds || path.join(__dirname, '../config/creatorSeeds.example.json'));
  const env = {
    ...process.env,
    AINEWS_DB_PATH: database,
    AYA_CREATOR_SEEDS_PATH: seeds,
    AYA_CREATOR_REQUEST_BUDGET: options.requestBudget || '100'
  };
  const store = new CreatorStore({ dbPath: database }).initialize();
  const sourceRegistry = new CreatorSourceRegistry({ env });
  const service = new CreatorService({ store, sourceRegistry, env }).initialize();
  try {
    const accounts = service.listEnabledAccounts();
    const started = Date.now();
    const results = await service.collector.collectMany(accounts, {
      mode: 'incremental', budget: service.requestBudget()
    });
    const elapsedMs = Date.now() - started;
    const replays = results.map((result, index) => {
      if (result.status !== 'success') return { inserted: 0, updated: 0, skipped: true };
      return store.commitPage({
        accountId: accounts[index].id,
        cursorKind: 'canary-replay',
        posts: result.posts || [],
        nextCursor: result.nextCursor || null,
        exhausted: result.exhausted === true,
        collectedAt: new Date().toISOString()
      });
    });

    const historyAccount = accounts.find((account) => account.platform === 'github');
    const history = [];
    const historyPages = Math.min(Math.max(Number(options.historyPages || 3), 1), 10);
    if (historyAccount) {
      for (let page = 0; page < historyPages; page += 1) {
        const result = await service.backfillService.runAccount(historyAccount, {
          budget: service.requestBudget()
        });
        history.push(result);
        if (['complete', 'partial', 'blocked', 'failed'].includes(result.status)) break;
      }
    }
    const intelligence = service.processor?.process?.() || null;

    const accountReports = accounts.map((account, index) => {
      const rows = storedRowsForAccount(store, account.id);
      const backfill = store.db.prepare(
        'SELECT state, next_cursor, oldest_fetched_at, newest_fetched_at, history_limit_reason, pages_fetched, items_fetched FROM creator_backfills WHERE account_id = ?'
      ).get(account.id) || null;
      return {
        creatorId: account.creatorId,
        accountId: account.id,
        platform: account.platform,
        sourceId: SOURCE_BY_PLATFORM[account.platform] || null,
        verticalIds: account.verticalIds,
        status: results[index]?.status || 'failed',
        reason: results[index]?.reason || null,
        received: results[index]?.posts?.length || 0,
        exhausted: results[index]?.exhausted === true,
        nextCursorPresent: Boolean(results[index]?.nextCursor),
        history: backfill ? {
          state: backfill.state,
          nextCursorPresent: Boolean(backfill.next_cursor),
          oldestFetchedAt: backfill.oldest_fetched_at,
          newestFetchedAt: backfill.newest_fetched_at,
          reason: backfill.history_limit_reason,
          pagesFetched: backfill.pages_fetched,
          itemsFetched: backfill.items_fetched
        } : null,
        ...summarizeStoredAccount(rows, results[index], replays[index])
      };
    });
    const sourceReports = sourceRegistry.list().map((source) => {
      const attempts = accounts.flatMap((account, index) => (
        SOURCE_BY_PLATFORM[account.platform] === source.id ? [results[index]] : []
      ));
      return {
        id: source.id,
        platform: source.platform,
        tier: source.tier,
        configured: source.configured,
        schedulable: source.schedulable,
        canaryStatus: classifyCanarySource(source, attempts),
        runtimeStatus: source.status,
        attemptCount: attempts.length,
        received: attempts.reduce((sum, item) => sum + (item.posts?.length || 0), 0),
        reason: attempts.find((item) => item.reason)?.reason || source.setupHint || null
      };
    });
    const sampledRows = store.db.prepare(`
      SELECT url, provenance_url, published_at
      FROM creator_posts
      ORDER BY published_at DESC, id
      LIMIT 100
    `).all();
    const urlStructure = validateStoredUrls(sampledRows);
    const originalUrlProbes = await probeOriginalUrls(sampledRows, Number(options.verifyUrls || 12));
    const totalStored = store.db.prepare('SELECT COUNT(*) AS count FROM creator_posts').get().count;
    const report = {
      schemaVersion: 'creator-source-canary-v1',
      generatedAt,
      finishedAt: new Date().toISOString(),
      database,
      seedFile: seeds,
      elapsedMs,
      totals: {
        verifiedAccounts: accounts.length,
        received: results.reduce((sum, item) => sum + (item.posts?.length || 0), 0),
        firstPassInserted: results.reduce((sum, item) => sum + Number(item.inserted || 0), 0),
        replayInserted: replays.reduce((sum, item) => sum + Number(item.inserted || 0), 0),
        stored: totalStored
      },
      urlVerification: {
        structuralSample: urlStructure,
        networkSample: {
          checked: originalUrlProbes.length,
          openable: originalUrlProbes.filter((item) => item.openable).length,
          results: originalUrlProbes
        }
      },
      historyCanary: {
        accountId: historyAccount?.id || null,
        requestedMaximumPages: historyPages,
        results: history
      },
      intelligence,
      accounts: accountReports,
      sources: sourceReports
    };
    if (options.report) {
      fs.mkdirSync(path.dirname(path.resolve(options.report)), { recursive: true });
      fs.writeFileSync(path.resolve(options.report), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    }
    return report;
  } finally {
    store.close();
    if (temporaryDirectory && !options.keepTemporary) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write([
      'Usage: node server/scripts/canary-creator-sources.js [options]',
      '',
      '  --database PATH       Preserve results in this SQLite database',
      '  --seeds PATH          Verified creator seed catalog',
      '  --report PATH         Write the JSON verification report',
      '  --history-pages N     GitHub history pages to reconcile (1-10)',
      '  --verify-urls N       Original evidence URLs to open (default 12)',
      '  --request-budget N    Maximum connector requests',
      '  --keep true           Keep an automatically created temporary database',
      '  --help                Show this help',
      ''
    ].join('\n'));
    return;
  }
  const report = await runCanary({
    database: args.database,
    seeds: args.seeds,
    report: args.report,
    historyPages: args['history-pages'],
    verifyUrls: args['verify-urls'],
    requestBudget: args['request-budget'],
    keepTemporary: args.keep === 'true'
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyCanarySource,
  parseArgs,
  probeOriginalUrls,
  runCanary,
  summarizeStoredAccount,
  validateStoredUrls
};
