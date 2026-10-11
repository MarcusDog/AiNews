import type { RadarSource, SourceStatus } from '../radar-types'

const labels: Record<SourceStatus, string> = {
  online: '在线', degraded: '降级', offline: '离线', unconfigured: '未配置', disabled: '已禁用', pending: '待首次采集',
}

export function SourceMonitor({ sources }: { sources: RadarSource[] }) {
  return (
    <div className="border-t border-white/10">
      {sources.map((source) => (
        <div key={source.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/8 py-4 sm:grid-cols-[1fr_100px_120px] sm:items-center">
          <div>
            <span className="text-sm text-white/80">{source.name}</span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-white/35">{source.tier} · {source.region === 'cn' ? '国内' : '海外'}</span>
          </div>
          <span className="hidden text-right text-xs text-white/42 sm:block">{source.lastSaved} 条写入</span>
          <span className={`source-status source-status-${source.status} justify-self-end`}>{labels[source.status]}</span>
        </div>
      ))}
    </div>
  )
}
