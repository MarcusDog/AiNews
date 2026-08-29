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
    if (m) meta[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  const description = meta.description || null;
  const name = meta.name || skillId;
  return { name, description, raw };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSkill(skill) {
  const meta = readSkillMeta(skill.id);
  const description = meta?.description || skill.summary;
  return `
    <article class="skill-card" id="skill-${escapeHtml(skill.id)}">
      <header>
        <p class="skill-eyebrow">${escapeHtml(skill.installable.join(' · '))}</p>
        <h2>${escapeHtml(skill.name)} <span class="skill-version">v${escapeHtml(skill.version)}</span></h2>
        <p class="skill-tagline">${escapeHtml(skill.tagline)}</p>
        <p class="skill-repo">
          <span class="label">仓库</span>
          <a href="${escapeHtml(skill.repo)}" rel="noreferrer noopener">${escapeHtml(skill.repo)}</a>
        </p>
        <p class="skill-site">
          <span class="label">站点</span>
          <a href="${escapeHtml(skill.site)}" rel="noreferrer noopener">${escapeHtml(skill.site)}</a>
        </p>
      </header>
      <section class="skill-body">
        <h3>它是做什么的</h3>
        <p>${escapeHtml(description)}</p>
        <h3>能力清单</h3>
        <ul class="skill-capabilities">
          ${skill.capabilities.map((cap) => `<li><code>${escapeHtml(cap.name)}</code><span>${escapeHtml(cap.desc)}</span></li>`).join('\n          ')}
        </ul>
        <h3>运行要求</h3>
        <p>${escapeHtml(skill.runtime)}</p>
        <h3>如何安装</h3>
        <pre><code>cd ${escapeHtml(skill.repo.replace('https://github.com/', ''))}
npm install
npm test   # 运行 bundled 测试
npm run doctor  # 检查与 https://ainews.xiaotianaya.com 的连接</code></pre>
        <p class="skill-meta">manifest 路径 <code>/${escapeHtml(skill.id)}/SKILL.md</code>，机器可读入口 <code><a href="/skill.md">/skill.md</a></code></p>
      </section>
    </article>
  `;
}

function renderSkillsPage() {
  const skills = SKILL_MANIFEST.map(renderSkill).join('\n');
  const now = new Date().toISOString();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aya Skills · GitHub 仓库与能力清单</title>
  <meta name="description" content="AyaNews Skill 注册表：GitHub 仓库地址、SKILL.md 描述、运行要求与能力清单。" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="/assets/styles/skills.css" />
</head>
<body>
  <header class="page-header">
    <div class="container">
      <p class="eyebrow">Agent Skills · 2026-08-29</p>
      <h1>Aya Skills · 仓库地址与能力清单</h1>
      <p class="lede">AyaNews 把"内容生产需要的可验证证据"打包成可移植 Skill，让远程 Agent、本地编辑器、Web 控制台共享同一份契约。下面是这个站点当前发布的所有 Skill 的 GitHub 仓库地址与详细说明。</p>
      <nav class="page-toc" aria-label="本页导航">
        <a href="#skill-aya-news-skill">AyaNewsSkill</a>
        <a href="#skill-ainews">AiNews · Aya Creator Intelligence Radar</a>
        <a href="/skill.md">机器可读入口 /skill.md</a>
        <a href="/openapi.json">/openapi.json</a>
        <a href="/docs/SYSTEM_USAGE_GUIDE.md">系统使用方案</a>
      </nav>
    </div>
  </header>
  <main class="container">
    ${skills}
    <section class="page-footer">
      <p>生成时间：${escapeHtml(now)} · 缓存：none · 这是一份人类可读目录，不参与 API 路由；机器入口见 <code>/skill.md</code> 与 <code>/openapi.json</code>。</p>
      <p>任何一份 Skill 在使用前都必须经过一次 <code>node scripts/ainews.mjs doctor</code> 自检；任何字段冲突以实际运行实例的 <code>/openapi.json</code> 为准。</p>
    </section>
  </main>
</body>
</html>`;
}

function renderSkillsCss() {
  return `:root {
  --bg: #031a26;
  --fg: #f5f5f5;
  --muted: rgba(245, 245, 245, 0.65);
  --line: rgba(255, 255, 255, 0.12);
  --accent: #ffe79a;
  --code-bg: rgba(255, 255, 255, 0.06);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; }
.container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
.page-header { padding: 64px 0 32px; border-bottom: 1px solid var(--line); }
.eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 11px; color: var(--muted); margin: 0 0 12px; }
h1 { font-size: 40px; line-height: 1.15; margin: 0 0 16px; font-weight: 600; }
.lede { color: var(--muted); font-size: 15px; max-width: 720px; }
.page-toc { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
.page-toc a { font-size: 12px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); text-decoration: none; }
.page-toc a:hover { color: var(--fg); border-color: var(--fg); }
main { padding: 48px 0 96px; }
.skill-card { padding: 32px 0; border-top: 1px solid var(--line); }
.skill-card header { margin-bottom: 24px; }
.skill-eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 10px; color: var(--muted); margin: 0 0 8px; }
.skill-card h2 { margin: 0 0 8px; font-size: 28px; font-weight: 600; }
.skill-version { font-size: 14px; color: var(--muted); font-weight: 400; }
.skill-tagline { color: var(--muted); font-size: 14px; margin: 0 0 16px; }
.skill-repo, .skill-site { font-size: 13px; margin: 4px 0; color: var(--muted); }
.skill-repo .label, .skill-site .label { display: inline-block; min-width: 40px; color: var(--accent); }
.skill-repo a, .skill-site a { color: var(--fg); text-decoration: underline; text-decoration-color: var(--line); }
.skill-body h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); margin: 32px 0 8px; }
.skill-body p { margin: 0 0 12px; font-size: 14px; }
.skill-capabilities { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.skill-capabilities li { border: 1px solid var(--line); padding: 12px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.02); display: grid; gap: 4px; }
.skill-capabilities code { font-size: 13px; color: var(--accent); }
.skill-capabilities span { font-size: 12px; color: var(--muted); }
.skill-body pre { background: var(--code-bg); border: 1px solid var(--line); padding: 14px 18px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.55; }
.skill-body pre code { font-family: ui-monospace, 'SF Mono', monospace; color: var(--fg); }
.skill-meta { font-size: 12px; color: var(--muted); }
.skill-meta a { color: var(--fg); }
.page-footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
`;
}

function createSkillsRouter() {
  const router = express.Router();
  router.get('/skills', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(renderSkillsPage());
  });
  router.get('/assets/styles/skills.css', (req, res) => {
    res.set('Content-Type', 'text/css; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(renderSkillsCss());
  });
  return router;
}

module.exports = { createSkillsRouter };