import type { RadarChange, RadarTopic } from '../radar-types'

export function ChangeStream({ changes, topics }: { changes: RadarChange[]; topics: RadarTopic[] }) {
  const titles = new Map(topics.map((topic) => [topic.id, topic.title]))
  return (
    <ol className="border-l border-white/12 pl-6">
      {changes.slice(0, 8).map((change) => (
        <li key={change.seq} className="relative pb-6 text-sm text-white/62 last:pb-0">
          <span className="absolute -left-[27px] top-1 h-2 w-2 rounded-full bg-white/65" aria-hidden="true" />
          <span className="block text-[10px] uppercase tracking-[0.14em] text-white/35">#{change.seq} · {change.changeType === 'new' ? '新增' : '更新'}</span>
          <span className="mt-1 block">{titles.get(change.topicId) || '已离开当前时间窗的主题'}</span>
        </li>
      ))}
    </ol>
  )
}
