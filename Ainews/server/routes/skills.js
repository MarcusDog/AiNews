/**
 * GET /skills — human-facing skill registry page
 *
 * Server-rendered HTML so the SPA doesn't need a router. Lists the
 * portable Agent Skills this project ships, with the full description
 * the skill ships in its SKILL.md, install instructions, and the
 * upstream GitHub repos for each component.
 *
 * /skill.md stays the machine-readable manifest; /skills is the
 * human-readable catalog the site surfaces at the root.
 */

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

const SKILLS_ROOT = path.join(__dirname, '..', 'skills');

const SKILL_MANIFEST = [
  {
    id: 'aya-news-skill',
    name: 'AyaNewsSkill',
    version: '2.4',
    tagline: 'Portable research and content skill for source-backed AI news and creator intelligence.',
    repo: 'https://github.com/MarcusDog/AyaNewsSkill',
    repoSite: 'https://github.com/MarcusDog/AyaNewsSkill',
    site: 'https://ainews.xiaotianaya.com',
    installable: ['Codex', 'Claude Code', 'generic Agent Skills'],
    runtime: 'Node.js >= 18, no third-party deps',
    summary: 'Bundles the cross-vertical creator intelligence, deterministic event topics, and creator-hotness-v1 ranking into a portable skill. The same Skill can power a remote Claude Code session, a Codex agent, or a self-hosted Agent runtime.',
    capabilities: [
      { name: 'creators',         desc: '列出垂类已核验博主' },
      { name: 'creator-posts',    desc: '按关键词搜索已采集的公开帖子' },
      { name: 'creator-hot',      desc: '单博主爆款 / 多博主共题 / 跨平台扩散' },
      { name: 'creator-topics',   desc: '跨博主 Creator Topic + 原始证据链接' },
      { name: 'creator-sources',  desc: '区分支持、已配置、在线、partial、blocked 与 unconfigured' },
      { name: 'creator-changes',  desc: '按单调 seq 游标读取已提交 Creator 事件' },
      { name: 'topics / topic',   desc: 'Hot Topics 24h / 48h / 72h + Topic 详情' },
      { name: 'opportunities',    desc: 'Creator Opportunity（general / short-video / tool-review / news-commentary / deep-dive）' },
      { name: 'random-opportunity', desc: '随机选题 + exclude 防重复' },
      { name: 'changes',          desc: '确定性事件变化流（HTTP 410 → 重同步）' },
      { name: 'brief',            desc: '面向内容生产的 Brief 编排器（证据包 + 引用政策）' },
      { name: 'search / trends / latest / source-health / vision', desc: 'Content v1 + 信号源健康 + 多元化审计' }
    ]
  },
  {
    id: 'ainews',
    name: 'AiNews · Aya Creator Intelligence Radar',
    version: 'Aya Creator Intelligence Radar PR #1',
    tagline: 'AyaNews 主站点：AI 热点聚合 + 跨创作者雷达 + 选题与推送一体化。',
    repo: 'https://github.com/MarcusDog/AiNews',
    repoSite: 'https://github.com/MarcusDog/AiNews',
    site: 'https://ainews.xiaotianaya.com',
    installable: ['self-hosted Node.js deployment', 'PM2 + nginx + SQLite'],
    runtime: 'Node.js 20.19+, PM2, nginx',
    summary: '主仓库的代码：站点 server、Creator / Signals / Content 三个 v1 路由组、采集 cron、TrendingCache、creator-router 和 CreatorStore、运营控制台。本仓库包含所有可对外公开的路由与机读清单。',
    capabilities: [
      { name: '/api/content/v1/*',   desc: '面向人 / AI Agent 的统一新闻能力入口（latest / search / trends / brief / source-health）' },
      { name: '/api/signals/v1/*',   desc: '趋势聚类 + Topic + Opportunity + What Changed' },
      { name: '/api/creators/v1/*',  desc: '博主雷达 + 已采集帖子 + hotness + 跨创作者共题 + 持久订阅' },
      { name: '/api/news/*',        desc: '兼容旧版 News API（latest / feed / hot-rank / discover / by-source / sources）' },
      { name: '/openapi.json',       desc: 'OpenAPI 3.1 机器可读清单' },
      { name: '/skill.md',           desc: 'Agent 可读 skill 清单' },
      { name: '/feed.json / /rss.xml', desc: 'JSON Feed 1.1 + RSS 2.0 公共订阅' },
      { name: '/topics/feed.json / /topics/rss.xml', desc: 'Topic 专属 Feed / RSS' },
      { name: '/docs/SYSTEM_USAGE_GUIDE.md', desc: '人类阅读的"系统使用方案"入口' }
    ]
  }
];

function readSkillMeta(skillId) {
  const skillPath = path.join(SKILLS_ROOT, skillId, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const raw = fs.readFileSync(skillPath, 'utf8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return { name: skillId, description: null, raw };
  const block = frontmatterMatch[1];
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { name: meta.name || skillId, description: meta.description || null, raw };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSkillsPage(req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('text/html');

  const cards = SKILL_MANIFEST.map((skill) => {
    const meta = readSkillMeta(skill.id);
    const description = meta?.description
      ? `<p class="description">${escapeHtml(meta.description)}</p>`
      : `<p class="description">${escapeHtml(skill.summary)}</p>`;

    const capabilities = skill.capabilities.map((c) => `
      <li>
        <code>${escapeHtml(c.name)}</code>
        <span>${escapeHtml(c.desc)}</span>
      </li>
    `).join('');

    const installable = skill.installable.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join('');

    return `
      <article class="skill-card" id="skill-${escapeHtml(skill.id)}">
        <header>
          <h2>${escapeHtml(skill.name)}</h2>
          <span class="version">v${escapeHtml(skill.version)}</span>
        </header>
        <p class="tagline">${escapeHtml(skill.tagline)}</p>
        ${description}
        <dl class="meta">
          <dt>Runtime</dt><dd>${escapeHtml(skill.runtime)}</dd>
          <dt>Repo</dt><dd><a href="${escapeHtml(skill.repo)}" target="_blank" rel="noreferrer">${escapeHtml(skill.repo)}</a></dd>
          <dt>Site</dt><dd><a href="${escapeHtml(skill.site)}" target="_blank" rel="noreferrer">${escapeHtml(skill.site)}</a></dd>
          <dt>Installable on</dt><dd class="tags">${installable}</dd>
        </dl>
        <h3>Capabilities</h3>
        <ul class="capabilities">${capabilities}</ul>
      </article>
    `;
  }).join('');

  const html = `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aya Skill Registry · ainews.xiaotianaya.com</title>
  <meta name="description" content="Portable Agent Skills shipped by AyaNews — server-rendered catalog of AyaNewsSkill and the AiNews / Aya Creator Intelligence Radar stack.">
  <link rel="stylesheet" href="/assets/styles/skills.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif; max-width: 920px; margin: 0 auto; padding: 48px 24px 80px; background: #faf9f4; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .lede { color: #6d655b; margin-bottom: 32px; }
    .skill-card { background: #fff; border: 1px solid #ddd5c8; padding: 24px; margin-bottom: 24px; border-radius: 4px; }
    .skill-card header { display: flex; align-items: baseline; gap: 12px; }
    .skill-card h2 { margin: 0; font-size: 22px; }
    .skill-card .version { color: #8c3f30; font-family: monospace; font-size: 13px; }
    .skill-card .tagline { color: #6d655b; margin: 4px 0 16px; }
    .skill-card .description { line-height: 1.6; }
    .skill-card .meta { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; font-size: 13px; margin: 16px 0; }
    .skill-card .meta dt { color: #6d655b; font-weight: 600; }
    .skill-card .meta dd { margin: 0; }
    .skill-card .tag { display: inline-block; padding: 2px 8px; margin: 2px; background: #fbf3ec; color: #8c3f30; border: 1px solid #e6d5c5; font-size: 12px; border-radius: 3px; }
    .skill-card h3 { margin: 16px 0 8px; font-size: 16px; }
    .skill-card .capabilities { list-style: none; padding: 0; }
    .skill-card .capabilities li { padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 13px; }
    .skill-card .capabilities code { background: #f4ede3; padding: 1px 6px; border-radius: 3px; font-size: 12px; color: #8c3f30; margin-right: 8px; }
    footer { color: #8c8479; font-size: 12px; text-align: center; margin-top: 48px; }
    a { color: #8c3f30; text-decoration: none; border-bottom: 1px dotted #a34f3c; }
    a:hover { border-bottom-style: solid; }
  </style>
</head>
<body>
  <h1>Aya Skill Registry</h1>
  <p class="lede">这一页列出 AyaNews 当前随站点发布的便携 Agent Skills。每个 Skill 都可以在 Codex / Claude Code / 自托管 Agent runtime 上独立加载使用，site only 提供 catalog 与对外路由。</p>
  ${cards}
  <footer>
    <p>机器可读 manifest: <a href="/skill.md">/skill.md</a> · JSON API: <a href="/openapi.json">/openapi.json</a> · JSON Feed: <a href="/feed.json">/feed.json</a></p>
  </footer>
</body>
</html>`;
  res.send(html);
}

function createSkillsRouter() {
  const router = express.Router();
  router.get('/', renderSkillsPage);
  router.get('', renderSkillsPage); // tolerate bare /skills without trailing slash
  return router;
}

const router = createSkillsRouter();
router.createSkillsRouter = createSkillsRouter;

module.exports = router;
module.exports.createSkillsRouter = createSkillsRouter;