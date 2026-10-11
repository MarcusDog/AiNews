#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const CreatorStore = require('../services/creators/creator-store');

const ROWS = Math.max(100000, Number(process.env.AYA_CREATOR_BENCHMARK_ROWS || 100000));
const RUNS = Math.max(10, Number(process.env.AYA_CREATOR_BENCHMARK_RUNS || 20));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-query-benchmark-'));
const store = new CreatorStore({ dbPath: path.join(directory, 'benchmark.db') }).initialize();

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function measure(name, query) {
  query();
  const samples = [];
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now();
    query();
    samples.push(performance.now() - started);
  }
  return {
    name,
    runs: RUNS,
    p50Ms: Number(percentile(samples, 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2))
  };
}

try {
  const timestamp = '2026-08-29T00:00:00.000Z';
  store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'vertical-v1', keywords: ['AI'], negativeKeywords: [], createdAt: timestamp }]);
  store.upsertCreators([{ id: 'benchmark-creator', displayName: 'Benchmark Creator', kind: 'media', reviewStatus: 'verified', reviewedAt: timestamp, verticalIds: ['ai-tech'] }]);
  store.upsertAccounts([{
    id: 'benchmark-account', creatorId: 'benchmark-creator', platform: 'rss',
    externalAccountId: 'benchmark-feed', profileUrl: 'https://example.com/benchmark',
    region: 'global', sourceTier: 'L1', enabled: true, lastVerifiedAt: timestamp,
    authState: 'not_required', nextRunAt: timestamp
  }]);

  const insertPost = store.db.prepare(`
    INSERT INTO creator_posts (
      id, account_id, platform, external_post_id, url, title, text, content_type,
      published_at, collected_at, edited_at, deleted_at, language, source_confidence,
      provenance_url, created_at, updated_at
    ) VALUES (?, 'benchmark-account', 'rss', ?, ?, ?, ?, 'article', ?, ?, NULL, NULL, 'zh-CN', 'public', ?, ?, ?)
  `);
  const insertVertical = store.db.prepare(
    "INSERT INTO creator_post_verticals (post_id, vertical_id, created_at) VALUES (?, 'ai-tech', ?)"
  );
  const insertFts = store.db.prepare(
    'INSERT INTO creator_posts_fts (post_id, title, text) VALUES (?, ?, ?)'
  );
  const seed = store.db.transaction(() => {
    const base = Date.parse('2026-08-29T00:00:00.000Z');
    for (let index = 0; index < ROWS; index += 1) {
      const id = `benchmark-post-${String(index).padStart(6, '0')}`;
      const publishedAt = new Date(base - index * 1000).toISOString();
      const title = index % 7 === 0 ? `Agent workflow 实测 ${index}` : `Creator intelligence item ${index}`;
      const text = index % 11 === 0 ? 'OpenAI Agent creator workflow benchmark' : '公开博主内容与热点追踪';
      const url = `https://example.com/posts/${index}`;
      insertPost.run(id, String(index), url, title, text, publishedAt, timestamp, url, timestamp, timestamp);
      insertVertical.run(id, timestamp);
      insertFts.run(id, `${title} 实 测`, `${text} 公 开 博 主 内 容 与 热 点 追 踪`);
    }
  });
  seed();
  store.db.exec('ANALYZE; PRAGMA optimize;');

  const firstPage = store.queryPosts({ limit: 50, vertical: 'ai-tech' });
  const results = [
    measure('latest_posts', () => store.queryPosts({ limit: 50 })),
    measure('vertical_latest', () => store.queryPosts({ vertical: 'ai-tech', limit: 50 })),
    measure('cursor_second_page', () => store.queryPosts({ vertical: 'ai-tech', limit: 50, cursor: firstPage.nextCursor })),
    measure('fts_agent', () => store.queryPosts({ q: 'Agent workflow', limit: 50 })),
    measure('fts_unicode', () => store.queryPosts({ q: '热点追踪', limit: 50 }))
  ];
  const maximumP95 = Math.max(...results.map((item) => item.p95Ms));
  const report = {
    rows: ROWS,
    runsPerQuery: RUNS,
    sqliteVersion: store.db.prepare('SELECT sqlite_version() AS version').get().version,
    results,
    maximumP95Ms: maximumP95,
    thresholdMs: 300,
    passed: maximumP95 < 300
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
} finally {
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
