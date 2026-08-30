#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  process.env.AYA_CREATOR_SEEDS_PATH ||= path.join(__dirname, '../config/creatorBenchmarks.json');
  const DatabaseService = require('../services/DatabaseService');
  const NewsService = require('../services/NewsService');
  const SignalService = require('../services/signals/signal-service');
  const CreatorStore = require('../services/creators/creator-store');
  const CreatorService = require('../services/creators/creator-service');
  const { CreatorSourceRegistry } = require('../services/creators/creator-source-registry');
  const DailyRefreshService = require('../services/daily-refresh-service');

  await DatabaseService.initialize();
  const creatorStore = new CreatorStore({ dbPath: process.env.AINEWS_DB_PATH }).initialize();
  const creatorService = new CreatorService({
    env: process.env,
    store: creatorStore,
    sourceRegistry: new CreatorSourceRegistry({ env: process.env })
  }).initialize();
  const signalService = new SignalService({ env: process.env, newsService: NewsService }).initialize();
  try {
    const service = new DailyRefreshService({
      newsService: NewsService,
      signalService,
      creatorService,
      creatorStore
    });
    const report = await service.run({
      reason: process.env.AYA_DAILY_REASON || 'manual_daily_refresh',
      includeCreators: true,
      signalSourceLimit: process.env.AINEWS_SIGNAL_SOURCE_LIMIT,
      windowHours: 72
    });
    const reportPath = path.resolve(process.env.AYA_DAILY_REPORT || path.join(__dirname, '../logs/daily-refresh-latest.json'));
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== 'success' && process.env.AYA_DAILY_FAIL_ON_DEGRADED === '1') process.exitCode = 1;
  } finally {
    signalService.close();
    creatorStore.close();
    await DatabaseService.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
