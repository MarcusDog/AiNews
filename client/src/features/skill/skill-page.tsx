import { WorkspaceHeader } from '@/components/workspace-header'

const interfaces = [
  ['/api/news/hot-rank?window=24h', '24 小时真实热点'], ['/api/news/discover?profile=tool-review', '创作者机会'],
  ['/api/news/dashboard?window=72h', '聚合面板'], ['/api/signals/v1/sources', '来源健康'],
  ['/openapi.json', 'OpenAPI 3.1'], ['/topics/feed.json', 'Topic JSON Feed'],
]

export function SkillPage() {
  return <main className="min-h-svh bg-[#031a26] text-white"><WorkspaceHeader current="skills" /><div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Agent access surface</p><h1 className="mt-3 font-display text-5xl sm:text-7xl">AyaNewsSkill</h1><p className="mt-5 max-w-3xl text-sm leading-7 text-white/52">AyaNews 官方 AI News Research & Evidence Skill。给人类提供清晰说明，给 Agent 保留稳定接口、原始 URL 与证据边界。</p>
    <section className="mt-14 grid gap-10 lg:grid-cols-2"><div><h2 className="font-display text-3xl">机器可读接口</h2><div className="mt-6 divide-y divide-white/10 border-y border-white/10">{interfaces.map(([href, label]) => <a key={href} href={href} className="flex items-center justify-between gap-4 py-4 text-sm hover:text-white"><span>{label}</span><code className="text-xs text-white/38">{href}</code></a>)}</div></div><div><h2 className="font-display text-3xl">研究规则</h2><ol className="mt-6 space-y-4 text-sm leading-6 text-white/55"><li>1. 先检索，后结论；不得用模型记忆补齐最新事实。</li><li>2. 事实、数字与归因必须保留原始 URL。</li><li>3. 单来源或单平台必须降低确定性。</li><li>4. Trend Score 与 Creator Score 只用于站内排序。</li></ol><a href="/skill.md" className="mt-8 inline-flex rounded-full border border-white/18 px-5 py-3 text-sm hover:bg-white/5">查看原始 Skill Markdown</a></div></section>
  </div></main>
}
