import { useState } from 'react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import type { RadarTopic } from '../radar-types'

const directionLabels: Record<string, string> = { new: '新出现', rising: '正在升温', cooling: '热度回落', steady: '持续观察' }

export function TopicCard({ topic, rank }: { topic: RadarTopic; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const firstEvidence = topic.signals[0]
  const scoreItems = Object.entries(topic.scoreBreakdown).filter(([, value]) => typeof value === 'number')
  return (
    <article className="radar-topic-row grid gap-5 border-t border-white/10 py-7 lg:grid-cols-[52px_minmax(0,1fr)_220px]">
      <span className="font-display text-3xl text-white/28">{String(rank).padStart(2, '0')}</span>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/48">
          <span>{directionLabels[topic.trendDirection] || topic.trendDirection}</span>
          <span aria-hidden="true">·</span>
          <span>{topic.evidenceCount} 条证据</span>
          {topic.evidenceStrength === 'single-source' && <span className="rounded-full border border-amber-200/25 px-2 py-0.5 text-amber-100">单一来源</span>}
        </div>
        <h3 className="text-xl font-medium leading-snug text-white sm:text-2xl">{topic.title}</h3>
        {topic.summary && <p className="mt-3 line-clamp-3 max-w-3xl text-sm leading-6 text-white/55">{topic.summary}</p>}
        {firstEvidence && (
          <a href={firstEvidence.url} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/65 transition hover:text-white">
            {firstEvidence.sourceName} 原始证据 <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 lg:flex-col lg:items-end">
        <div className="text-right">
          <span className="block font-display text-5xl leading-none text-white">{topic.trendScore}</span>
          <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-white/40">trend score</span>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="inline-flex items-center gap-1.5 text-xs text-white/55 transition hover:text-white" aria-label={`趋势分 ${topic.trendScore}，查看评分解释`}>
          评分解释 <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div className="lg:col-start-2 lg:col-span-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55">
          {scoreItems.map(([key, value]) => <span key={key}>{({ freshness: '新鲜度', engagement: '互动', momentum: '动量', diversity: '多平台', trust: '可信度', project: '项目' } as Record<string, string>)[key] || key} {String(value)}</span>)}
          <span>公式 {topic.formulaVersion}</span>
        </div>
      )}
    </article>
  )
}
