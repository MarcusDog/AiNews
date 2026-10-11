import { ArrowUpRight, GitFork, Star } from 'lucide-react'
import type { RadarSignal } from '../radar-types'

export function ProjectSignalCard({ signal }: { signal: RadarSignal }) {
  const stars = signal.metrics.stars
  const forks = signal.metrics.forks
  return (
    <a href={signal.url} target="_blank" rel="noreferrer noopener" className="group grid gap-3 border-t border-white/10 py-6 transition hover:border-white/25 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">{signal.repoFullName || signal.sourceName}</p>
        <p className="mt-2 text-sm leading-6 text-white/68">{signal.summary || '查看仓库原始说明、提交与指标。'}</p>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/55">
        {typeof stars === 'number' && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" aria-hidden="true" />{stars} stars</span>}
        {typeof forks === 'number' && <span className="inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" aria-hidden="true" />{forks} forks</span>}
        <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </div>
    </a>
  )
}
