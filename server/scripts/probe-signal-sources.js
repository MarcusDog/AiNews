#!/usr/bin/env node

const { buildSignalSourceCatalog } = require('../config/signalSources');
const { normalizeSignal } = require('../services/signals/signal-normalizer');
const HackerNewsAdapter = require('../services/signals/adapters/hacker-news-adapter');
const GitHubAdapter = require('../services/signals/adapters/github-adapter');
const MastodonAdapter = require('../services/signals/adapters/mastodon-adapter');
const HuggingFaceAdapter = require('../services/signals/adapters/hugging-face-adapter');
const BilibiliAdapter = require('../services/signals/adapters/bilibili-adapter');
const RssSignalAdapter = require('../services/signals/adapters/rss-signal-adapter');

const factories = {
  'hacker-news': () => new HackerNewsAdapter(),
  github: () => new GitHubAdapter(),
  mastodon: () => new MastodonAdapter(),
  'hugging-face': () => new HuggingFaceAdapter(),
  bilibili: () => new BilibiliAdapter(),
  'rss-signal': () => new RssSignalAdapter()
};

async function probe() {
  const catalog = buildSignalSourceCatalog(process.env).filter((source) =>
    source.tier === 'L1' && source.schedulable && factories[source.adapter]
  );
  const limit = Math.max(1, Math.min(Number(process.env.AINEWS_SIGNAL_SOURCE_LIMIT) || 5, 20));
  const results = [];

  for (const source of catalog) {
    const started = Date.now();
    try {
      const adapterResult = await factories[source.adapter]().collect(source, { limit });
      const items = Array.isArray(adapterResult) ? adapterResult : adapterResult.items || [];
      const valid = items.map((item) => normalizeSignal(item, source)).length;
      results.push({
        id: source.id,
        platform: source.platform,
        status: 'success',
        received: items.length,
        valid,
        durationMs: Date.now() - started
      });
    } catch (error) {
      results.push({
        id: source.id,
        platform: source.platform,
        status: 'failure',
        received: 0,
        valid: 0,
        durationMs: Date.now() - started,
        error: String(error.message || error).slice(0, 240)
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    limitPerSource: limit,
    success: results.filter((item) => item.status === 'success').length,
    failure: results.filter((item) => item.status === 'failure').length,
    totalValid: results.reduce((sum, item) => sum + item.valid, 0),
    sources: results
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.success === 0 || summary.totalValid === 0) process.exitCode = 1;
}

probe().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
