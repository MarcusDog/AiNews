import { Dices, LoaderCircle } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { Button } from '@/components/ui/button'
import { useTopicIdea, type CreatorProfile, type TopicLoader, type TopicWindow } from './use-topic-idea'
import { useState } from 'react'

const profiles: Array<{ value: CreatorProfile; label: string }> = [
  { value: 'general', label: '综合创作者' }, { value: 'short-video', label: '短视频口播' },
  { value: 'tool-review', label: '工具实测' }, { value: 'news-commentary', label: '热点快评' },
  { value: 'deep-dive', label: '深度拆解' },
]

export function TopicWorkbench({ loadArticles, random }: { loadArticles?: TopicLoader; random?: () => number }) {
  const [profile, setProfile] = useState<CreatorProfile>('general')
  const [window, setWindow] = useState<TopicWindow>('72h')
  const { status, availability, idea, reroll } = useTopicIdea({ active: true, loadArticles, random, profile, window })
  return (
    <main className="min-h-svh bg-[#031a26] text-white">
      <WorkspaceHeader current="topics" />
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Creator opportunity desk</p>
        <h1 className="mt-3 font-display text-5xl sm:text-7xl">创作者选题工作台</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/50">按真实 AI 热点、社交讨论、产品与项目证据选题。论文默认不会进入工具实测等画像。</p>

        <div className="mt-12 grid gap-5 border-y border-white/10 py-6 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-white/45">AI 博主类型<select aria-label="AI 博主类型" value={profile} onChange={(event) => setProfile(event.target.value as CreatorProfile)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white outline-none">{profiles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="grid gap-2 text-xs text-white/45">热点窗口<select aria-label="热点窗口" value={window} onChange={(event) => setWindow(event.target.value as TopicWindow)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white outline-none"><option value="24h">24 小时</option><option value="48h">48 小时</option><option value="72h">72 小时</option></select></label>
        </div>

        {status === 'loading' && <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-white/45"><LoaderCircle className="h-5 w-5 animate-spin" />正在读取创作者机会…</div>}
        {status === 'ready' && idea && <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/45"><span className="rounded-full border border-white/15 px-3 py-1 text-white/80">{idea.label}</span><span>{idea.lens}</span>{idea.kind === 'source-backed' && <span>Creator {idea.creatorScore} · 趋势 {idea.trendScore}</span>}</div>
            <h2 className="mt-6 max-w-4xl text-3xl font-medium leading-tight sm:text-5xl">{idea.title}</h2>
            {idea.context && <p className="mt-5 max-w-3xl text-sm leading-7 text-white/50">{idea.context}</p>}
            <dl className="mt-9 divide-y divide-white/10 border-y border-white/10 text-sm"><div className="grid gap-2 py-5 sm:grid-cols-[120px_1fr]"><dt className="text-white/38">内容切口</dt><dd>{idea.angle}</dd></div><div className="grid gap-2 py-5 sm:grid-cols-[120px_1fr]"><dt className="text-white/38">适合受众</dt><dd>{idea.audience}</dd></div><div className="grid gap-2 py-5 sm:grid-cols-[120px_1fr]"><dt className="text-white/38">今日交付</dt><dd>{idea.deliverable}</dd></div></dl>
            {idea.kind === 'source-backed' && idea.riskNotes?.map((note) => <p key={note} className="mt-4 border-l border-amber-100/30 pl-3 text-sm text-amber-50/75">{note}</p>)}
          </div>
          <aside className="border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><p className="text-xs uppercase tracking-[0.16em] text-white/35">Next action</p><Button onClick={reroll} variant="glass" className="mt-5 w-full gap-2"><Dices className="h-4 w-4" />随机给我一题</Button>{idea.kind === 'source-backed' && <><a href={`/research?topic=${encodeURIComponent(idea.title)}&topicId=${encodeURIComponent(idea.id)}`} className="mt-3 inline-flex w-full justify-center rounded-full bg-white px-5 py-3 text-sm font-medium text-[#031a26]">进入研究工作台</a><a href={idea.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-4 block text-center text-xs text-white/45 hover:text-white">查看原始证据 ↗</a></>}{availability !== 'source-backed' && <p className="mt-4 text-xs leading-5 text-white/38">当前显示的是明确标记的创作练习，不冒充实时热点。</p>}</aside>
        </section>}
      </div>
    </main>
  )
}
