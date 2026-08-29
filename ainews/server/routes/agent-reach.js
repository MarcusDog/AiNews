/**
 * Agent-Reach adapter for ainews.
 *
 * Bridges the Agent Reach CLI (Panniantong/Agent-Reach) into HTTP
 * endpoints ainews can call from cron / admin / Creator Intelligence.
 *
 * Agent-Reach itself is a Python CLI (no HTTP server), so this adapter
 * shells out and parses stdout into JSON. Every successful command
 * is recorded as a `creator_post` row with `source_confidence: 'agent-reach'`
 * so the data shows up in the existing /api/creators/v1/* APIs.
 *
 * Routes (read-only):
 *   GET  /api/agent-reach/doctor                - run `agent-reach doctor`
 *   GET  /api/agent-reach/youtube-search?q=...  - yt-dlp ytsearch:N
 *   GET  /api/agent-reach/web-read?url=...      - Jina Reader (any URL)
 *   GET  /api/agent-reach/rss?url=...           - read RSS/Atom source
 *   GET  /api/agent-reach/version               - show installed version
 *
 * Repository: https://github.com/Panniantong/Agent-Reach
 */

const express = require('express');
const { execFile, exec } = require('node:child_process');
const path = require('node:path');

const AGENT_REACH_BIN = process.env.AGENT_REACH_BIN || 'agent-reach';
const AGENT_REACH_PY = process.env.AGENT_REACH_PY || '/opt/Agent-Reach';
const TIMEOUT_MS = 30000;

function execCapture(cmd, args, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.signal === 'SIGTERM') {
        return reject(new Error(`${cmd} timed out after ${timeout}ms`));
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), code: error?.code ?? 0 });
    });
  });
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

async function runDoctor() {
  const result = await execCapture(AGENT_REACH_BIN, ['doctor']);
  return {
    code: result.code,
    raw: result.stdout,
    parsed: parseDoctorReport(result.stdout)
  };
}

function parseDoctorReport(text) {
  if (!text) return { status: 'unknown', channels: [] };
  const lines = text.split('\n');
  const channels = [];
  let inChannelBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([✅!X✘]) ?(.{0,2}) ?(.+?)\s+—\s+(.+)$/);
    if (m) {
      const [, statusRaw, marker, name, detail] = m;
      let status = 'warn';
      if (statusRaw === '✅') status = 'ok';
      else if (statusRaw === '!') status = 'warn';
      else if (statusRaw === 'X' || statusRaw === '✘') status = 'missing';
      channels.push({ name, status, detail });
    }
  }
  const summaryMatch = text.match(/状态：(\d+)\/(\d+) 个渠道可用/);
  const summary = summaryMatch ? { ready: Number(summaryMatch[1]), total: Number(summaryMatch[2]) } : null;
  return { status: summary ? (summary.ready > 0 ? 'ok' : 'warn') : 'unknown', channels, summary };
}

async function runYouTubeSearch(query) {
  if (!query) throw new Error('query required');
  // yt-dlp prints one record per line when --print is set
  const { stdout } = await execCapture('yt-dlp', [
    '--flat-playlist',
    '--skip-download',
    '--print', 'title',
    '--print', 'url',
    '--print', 'uploader',
    '--print', 'duration_string',
    `ytsearch10:${query}`
  ], { timeout: 45000 });
  const records = parseYtDlpFlat(stdout);
  return { query, items: records };
}

function parseYtDlpFlat(text) {
  // yt-dlp --flat-playlist prints fields in the order specified, separated by
  // a literal newline between records.
  const chunks = text.split(/\n(?=\S)/);
  const out = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const [title, url, uploader, duration] = lines;
    if (!title || !url) continue;
    out.push({
      id: `ar-yt-${Buffer.from(url).toString('base64url').slice(0, 18)}`,
      title,
      url,
      uploader: uploader || null,
      duration: duration || null,
      source_confidence: 'agent-reach',
      collectedAt: new Date().toISOString()
    });
  }
  return out;
}

async function runWebRead(url) {
  if (!url) throw new Error('url required');
  const { stdout } = await execCapture('curl', ['-sL', '-A', 'Mozilla/5.0 (ainews)', `https://r.jina.ai/${url}`]);
  return {
    url,
    content: String(stdout).slice(0, 8000),
    excerpt: String(stdout).slice(0, 480),
    source_confidence: 'agent-reach',
    collectedAt: new Date().toISOString()
  };
}

async function runRss(url) {
  if (!url) throw new Error('url required');
  // Use feedparser via a tiny inline Python script so we get proper JSON.
  const pythonCode = `
import sys, json, feedparser
result = feedparser.parse("${url.replace(/"/g, '\\"')}")
items = []
for entry in result.entries[:20]:
    items.append({
        "id": entry.get("id") or entry.get("link"),
        "title": entry.get("title"),
        "url": entry.get("link"),
        "summary": entry.get("summary"),
        "publishedAt": entry.get("published"),
        "source_confidence": "agent-reach",
        "collectedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z"
    })
print(json.dumps({"feedTitle": result.feed.get("title"), "items": items}, ensure_ascii=False))
`;
  const { stdout } = await execCapture('python3', ['-c', pythonCode], { timeout: 20000 });
  return safeJsonParse(stdout, { items: [], error: 'invalid python output', raw: stdout.slice(0, 500) });
}

async function runVersion() {
  const { stdout } = await execCapture(AGENT_REACH_BIN, ['--version']);
  const line = stdout.trim();
  return { version: line.replace(/^Agent Reach\s+/i, '') || line, repository: 'https://github.com/Panniantong/Agent-Reach' };
}

function persistAsCreatorPosts(items, { creatorId, platform, verticalId = 'ai-tech', store }) {
  if (!Array.isArray(items) || !items.length) return { inserted: 0, updated: 0 };
  const accountId = `acct_agentreach_${platform}`;
  // Ensure creator + account rows exist
  store.db.prepare(`
    INSERT OR IGNORE INTO creators (id, display_name, kind, review_status, reviewed_at, created_at, updated_at)
    VALUES (?, ?, 'external', 'verified', ?, ?, ?)
  `).run(creatorId, `Agent-Reach ${platform}`, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

  store.db.prepare(`
    INSERT OR IGNORE INTO creator_vertical_memberships (creator_id, vertical_id, created_at) VALUES (?, ?, ?)
  `).run(creatorId, verticalId, new Date().toISOString());

  store.db.prepare(`
    INSERT OR IGNORE INTO creator_accounts (
      id, creator_id, platform, external_account_id, handle, profile_url, region,
      source_tier, enabled, last_verified_at, auth_state, backfill_state,
      oldest_fetched_at, newest_fetched_at, last_reconciled_at, next_cursor,
      history_limit_reason, next_run_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'global', 'L1', 1, ?, 'unconfigured', 'complete', ?, ?, ?, NULL, NULL, ?, ?, ?)
  `).run(
    accountId, creatorId, platform, `agent-reach-${platform}`, `agent-reach-${platform}`,
    'https://github.com/Panniantong/Agent-Reach', new Date().toISOString(),
    new Date().toISOString(), new Date().toISOString(), new Date().toISOString(),
    new Date().toISOString(), new Date().toISOString()
  );

  let result = { inserted: 0, updated: 0 };
  try {
    result = store.commitPage({
      accountId,
      posts: items.map((item) => ({
        id: item.id,
        externalPostId: item.id,
        url: item.url,
        title: item.title,
        text: item.summary || item.excerpt || '',
        contentType: 'external',
        publishedAt: item.publishedAt || item.collectedAt,
        collectedAt: item.collectedAt,
        sourceConfidence: 'agent-reach',
        provenanceUrl: item.url,
        language: 'en',
        platform
      })),
      cursorKind: 'incremental',
      collectedAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[agent-reach] persist failed:', error.message);
  }
  store.db.pragma('wal_checkpoint(FULL)');
  return result;
}

function createAgentReachRouter(options = {}) {
  const store = options.store;
  const router = express.Router();

  router.get('/version', async (req, res, next) => {
    try {
      const version = await runVersion();
      res.json({ success: true, data: version });
    } catch (error) { next(error); }
  });

  router.get('/doctor', async (req, res, next) => {
    try {
      const doctor = await runDoctor();
      res.json({ success: true, data: doctor });
    } catch (error) { next(error); }
  });

  router.get('/youtube-search', async (req, res, next) => {
    try {
      const query = req.query.q ? String(req.query.q) : '';
      const result = await runYouTubeSearch(query);
      // Persist as creator posts so the data shows in /api/creators/v1/posts
      let persistence = null;
      if (store) {
        persistence = persistAsCreatorPosts(result.items.map((it) => ({
          ...it,
          summary: `YouTube search via Agent-Reach · q=${result.query}`
        })), {
          creatorId: 'creator_agentreach_youtube',
          platform: 'youtube',
          store
        });
      }
      res.json({
        success: true,
        data: { query: result.query, count: result.items.length, items: result.items, persistence }
      });
    } catch (error) { next(error); }
  });

  router.get('/web-read', async (req, res, next) => {
    try {
      const url = req.query.url ? String(req.query.url) : '';
      const result = await runWebRead(url);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  });

  router.get('/rss', async (req, res, next) => {
    try {
      const url = req.query.url ? String(req.query.url) : '';
      const result = await runRss(url);
      let persistence = null;
      if (store && Array.isArray(result.items)) {
        persistence = persistAsCreatorPosts(result.items, {
          creatorId: 'creator_agentreach_rss',
          platform: 'rss',
          store
        });
      }
      res.json({ success: true, data: { ...result, persistence } });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAgentReachRouter, AGENT_REACH_BIN, AGENT_REACH_PY };