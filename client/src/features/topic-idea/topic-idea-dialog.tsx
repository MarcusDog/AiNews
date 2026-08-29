import { ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTopicIdea, type TopicLoader } from './use-topic-idea'
import { useState } from 'react'

interface TopicIdeaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loadArticles?: TopicLoader
  random?: () => number
}

export function TopicIdeaDialog({
  open,
  onOpenChange,
  loadArticles,
  random,
}: TopicIdeaDialogProps) {
  const [profile, setProfile] = useState<'general' | 'short-video' | 'tool-review' | 'news-commentary' | 'deep-dive'>('general')
  const { status, availability, idea, reroll } = useTopicIdea({
    active: open,
    loadArticles,
    random,
    profile,
  })

  const availabilityNotice = availability === 'unavailable'
    ? '实时来源暂不可用，先给你一条创作练习。'
    : availability === 'empty'
      ? '站内暂时没有可用来源，先完成一条创作练习。'
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>今天，就做这一题</DialogTitle>
          <DialogDescription>
            一次只做一个明确选题。有真实来源时保留证据；来源不可用时，只提供不冒充热点的创作练习。
          </DialogDescription>
        </DialogHeader>

        <label className="mt-5 grid gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          AI 博主类型
          <select aria-label="AI 博主类型" value={profile} onChange={(event) => setProfile(event.target.value as typeof profile)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-white/30">
            <option value="general">综合创作者</option>
            <option value="short-video">短视频口播</option>
            <option value="tool-review">工具实测</option>
            <option value="news-commentary">热点快评</option>
            <option value="deep-dive">深度拆解</option>
          </select>
        </label>

        {status === 'loading' && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-muted-foreground" aria-live="polite">
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
            <p className="text-sm">正在从站内来源抽取题材…</p>
          </div>
        )}

        {status === 'ready' && idea && (
          <div className="mt-7 space-y-7" aria-live="polite">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-foreground/85">
                  {idea.label}
                </span>
                <span className="text-xs text-muted-foreground">{idea.lens}</span>
                {idea.kind === 'source-backed' && typeof idea.creatorScore === 'number' && typeof idea.trendScore === 'number' && (
                  <span className="text-xs text-muted-foreground">Creator {idea.creatorScore} · 趋势 {idea.trendScore}</span>
                )}
              </div>
              <h2 className="text-balance text-2xl font-medium leading-tight text-foreground sm:text-3xl">
                {idea.title}
              </h2>
              {idea.context && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{idea.context}</p>}
              {availabilityNotice && <p className="mt-4 text-sm text-[#d7c7b7]">{availabilityNotice}</p>}
              {idea.kind === 'source-backed' && idea.riskNotes?.map((note) => (
                <p key={note} className="mt-4 border-l border-amber-100/35 pl-3 text-sm leading-relaxed text-amber-50/80">{note}</p>
              ))}
            </div>

            <dl className="divide-y divide-white/10 border-y border-white/10">
              <div className="grid gap-2 py-4 sm:grid-cols-[108px_1fr] sm:gap-5">
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">创作角度</dt>
                <dd className="text-sm leading-relaxed text-foreground/90">{idea.angle}</dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[108px_1fr] sm:gap-5">
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">适合受众</dt>
                <dd className="text-sm leading-relaxed text-foreground/90">{idea.audience}</dd>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[108px_1fr] sm:gap-5">
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">今日完成</dt>
                <dd className="text-sm leading-relaxed text-foreground/90">{idea.deliverable}</dd>
              </div>
            </dl>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" className="gap-2" onClick={reroll}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                换一个选题
              </Button>

              {idea.kind === 'source-backed' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                <a href={`/research?topic=${encodeURIComponent(idea.title)}&topicId=${encodeURIComponent(idea.id)}`} className="inline-flex items-center justify-center rounded-full border border-white/18 px-5 py-3 text-sm text-white transition hover:bg-white/5">做研究</a>
                <a
                  href={idea.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`查看 ${idea.source} 原始来源`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-[#061014] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-[#002a3d]"
                >
                  查看原始来源
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
