import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useRadar } from './use-radar'
import type { RadarLoader, RadarWindow } from './radar-types'
import { TopicCard } from './components/topic-card'
import { ProjectSignalCard } from './components/project-signal-card'
import { SourceMonitor } from './components/source-monitor'
import { ChangeStream } from './components/change-stream'

const windows: Array<{ value: RadarWindow; label: string }> = [
  { value: '24h', label: '24 小时' }, { value: '48h', label: '48 小时' }, { value: '72h', label: '72 小时' },
]

function SectionHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return <div className="mb-8 grid gap-3 md:grid-cols-[1fr_minmax(260px,420px)] md:items-end"><div><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/38">{eyebrow}</p><h2 className="mt-3 font-display text-4xl text-white sm:text-5xl">{title}</h2></div><p className="text-sm leading-6 text-white/45 md:text-right">{note}</p></div>
}

export function RadarDashboard({ loadRadar }: { loadRadar?: RadarLoader }) {
  const { window, setWindow, status, data, retry } = useRadar(loadRadar)
  const projects = data?.topics.flatMap((topic) => topic.signals).filter((signal) => signal.kind === 'repository' || Boolean(signal.repoFullName)) || []
  const domestic = data?.topics.filter((topic) => topic.signals.some((signal) => signal.region === 'cn')).length || 0
  const global = data?.topics.filter((topic) => topic.signals.some((signal) => signal.region === 'global')).length || 0

  return (
    <section id="radar" aria-labelledby="radar-title" className="radar-workspace relative z-20 bg-[#031a26] px-5 pb-24 pt-20 text-white sm:px-8 sm:pb-32 sm:pt-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 flex flex-col gap-8 border-b border-white/12 pb-8 md:flex-row md:items-end md:justify-between">
          <div><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Vision monitoring desk</p><h2 id="radar-title" className="mt-3 font-display text-5xl sm:text-6xl">视野监测台</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-white/50">只展示已采集并可回查的信号。分数用于排序，不替代原始证据。</p></div>
          <div className="inline-flex self-start rounded-full border border-white/12 p-1" aria-label="热点时间窗口">{windows.map((item) => <button key={item.value} type="button" onClick={() => setWindow(item.value)} aria-pressed={window === item.value} className={`rounded-full px-4 py-2 text-xs transition ${window === item.value ? 'bg-white text-[#031a26]' : 'text-white/52 hover:text-white'}`}>{item.label}</button>)}</div>
        </div>

        {status === 'loading' && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-white/45" aria-live="polite"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />正在读取真实热点与来源状态…</div>}
        {status === 'error' && <div className="min-h-64 border-y border-white/10 py-16 text-center"><h3 className="font-display text-3xl">视野监测暂时不可用</h3><p className="mt-3 text-sm text-white/45">现有数据没有被替换成示例；恢复连接后再加载。</p><button type="button" onClick={retry} className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-sm"><RefreshCw className="h-4 w-4" aria-hidden="true" />重新连接</button></div>}
        {status === 'empty' && <div className="min-h-64 border-y border-white/10 py-16 text-center"><h3 className="font-display text-3xl">当前窗口暂无可验证热点</h3><p className="mt-3 text-sm text-white/45">可以切换时间窗口，或等待下一轮来源采集。</p></div>}

        {status === 'ready' && data && <div className="space-y-28">
          <section><SectionHeading eyebrow={`${window} / ranked topics`} title="正在升温" note="按 trend-v1 排序；展开每条可查看新鲜度、动量、多平台和可信度贡献。" />{data.topics.slice(0, 6).map((topic, index) => <TopicCard key={topic.id} topic={topic} rank={index + 1} />)}</section>
          <section><SectionHeading eyebrow="creator opportunity" title="今日可做选题" note="选题角度只来自 Topic 标题、证据类型与可复现能力；单源主题会明确扣分。" /><div className="grid gap-x-12 gap-y-8 md:grid-cols-2">{data.topics.slice().sort((a, b) => b.creatorScore - a.creatorScore).slice(0, 4).map((topic) => <div key={topic.id} className="border-t border-white/10 pt-6"><span className="font-display text-4xl">{topic.creatorScore}</span><span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-white/35">creator score</span><h3 className="mt-4 text-lg font-medium">{topic.opportunity.angles[0]?.title || topic.title}</h3><p className="mt-2 text-sm leading-6 text-white/48">{topic.opportunity.angles[0]?.angle || topic.summary}</p></div>)}</div></section>
          <section><SectionHeading eyebrow="github / open source" title="开源项目雷达" note="只显示采集到真实仓库链接与返回指标的项目；缺失指标保持未知。" />{projects.length ? projects.slice(0, 6).map((signal) => <ProjectSignalCard key={signal.id} signal={signal} />) : <p className="border-t border-white/10 py-8 text-sm text-white/42">当前窗口没有带仓库证据的项目。</p>}</section>
          <section className="grid gap-16 lg:grid-cols-2"><div><SectionHeading eyebrow="region coverage" title="国内 / 海外视野" note="按当前 Topic 中实际证据地区计算，不代表平台总体热度。" /><div className="grid grid-cols-2 border-y border-white/10 py-8"><div><span className="font-display text-6xl">{domestic}</span><p className="mt-2 text-xs text-white/42">含国内证据</p></div><div className="border-l border-white/10 pl-8"><span className="font-display text-6xl">{global}</span><p className="mt-2 text-xs text-white/42">含海外证据</p></div></div></div><div><SectionHeading eyebrow="what changed" title="本次新增" note={`增量游标 ${data.nextCursor}；游标过期时客户端会重新同步。`} />{data.changes.length ? <ChangeStream changes={data.changes} topics={data.topics} /> : <p className="text-sm text-white/42">当前没有新的 Topic 变化。</p>}</div></section>
          <section><SectionHeading eyebrow="source operations" title="来源监测" note="“已配置”与“本次在线”分开呈现；可选 API 和 Sidecar 不会被误报为在线。" /><SourceMonitor sources={data.sources} /></section>
        </div>}
      </div>
    </section>
  )
}
