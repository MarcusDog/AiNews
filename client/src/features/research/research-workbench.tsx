import { FormEvent, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { Button } from '@/components/ui/button'

type Evidence = { citationId: string; title: string; source: string; url: string; claimBoundary?: string }
type Brief = { status: string; notice: string; angle?: string; evidence: Evidence[]; diversity?: { sources: number; regions: number; evidenceTypes: number }; outputGuide?: { sections?: Array<{ title: string }> }; citationPolicy?: string }

function initialTopic(path: string) {
  try { return new URL(path, 'https://ainews.local').searchParams.get('topic') || '' } catch { return '' }
}

function initialTopicId(path: string) {
  try { return new URL(path, 'https://ainews.local').searchParams.get('topicId') || '' } catch { return '' }
}

export function ResearchWorkbench({ path, fetchImpl = fetch }: { path: string; fetchImpl?: typeof fetch }) {
  const [topic, setTopic] = useState(() => initialTopic(path))
  const [topicId, setTopicId] = useState(() => initialTopicId(path))
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!topic.trim()) return
    setStatus('loading'); setError(''); setBrief(null)
    try {
      const query = new URLSearchParams({ topic: topic.trim(), audience: 'AI 自媒体创作者', goal: '完成可发布且可核查的研究提纲', format: 'article', days: '14', limit: '6' })
      if (topicId) query.set('topicId', topicId)
      const response = await fetchImpl(`/api/content/v1/brief?${query}`, { headers: { Accept: 'application/json' } })
      const payload = await response.json()
      if (!payload?.data) throw new Error(payload?.error || `研究接口暂不可用（${response.status}）`)
      setBrief(payload.data); setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '研究接口暂不可用'); setStatus('error')
    }
  }

  return <main className="min-h-svh bg-[#031a26] text-white"><WorkspaceHeader current="research" /><div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Evidence research desk</p><h1 className="mt-3 font-display text-5xl sm:text-7xl">研究工作台</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-white/50">这里返回可引用的证据包和研究结构，不把模型生成当成事实。</p>
    <form onSubmit={submit} className="mt-12 flex flex-col gap-3 border-y border-white/10 py-6 sm:flex-row"><label className="sr-only" htmlFor="research-topic">研究主题</label><input id="research-topic" value={topic} onChange={(event) => { setTopic(event.target.value); setTopicId('') }} placeholder="输入 AI 产品、事件或项目" className="min-h-12 flex-1 rounded-full border border-white/12 bg-[#062333] px-5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30" /><Button type="submit" disabled={!topic.trim() || status === 'loading'} className="gap-2">{status === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}开始研究</Button></form>
    {status === 'idle' && <p className="py-16 text-sm text-white/38">输入一个具体主题，或从选题工作台带入题目。</p>}
    {status === 'error' && <p role="alert" className="py-16 text-sm text-rose-100/80">{error}</p>}
    {status === 'ready' && brief && <section className="mt-12 grid gap-12 lg:grid-cols-[1fr_320px]"><div><p className={`text-sm ${brief.status === 'ready' ? 'text-emerald-100/80' : 'text-amber-100/80'}`}>{brief.notice}</p>{brief.angle && <h2 className="mt-5 text-2xl font-medium leading-snug">{brief.angle}</h2>}<div className="mt-9 divide-y divide-white/10 border-y border-white/10">{brief.evidence.map((item) => <article key={item.citationId} className="py-5"><div className="flex gap-3"><span className="font-display text-2xl text-white/40">{item.citationId}</span><div><a href={item.url} target="_blank" rel="noreferrer noopener" className="font-medium hover:underline">{item.title} ↗</a><p className="mt-2 text-xs text-white/42">{item.source}{item.claimBoundary ? ` · ${item.claimBoundary}` : ''}</p></div></div></article>)}</div></div><aside className="border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><p className="text-xs uppercase tracking-[0.16em] text-white/35">Evidence boundary</p><p className="mt-4 text-sm leading-6 text-white/58">{brief.citationPolicy}</p>{brief.diversity && <dl className="mt-7 grid grid-cols-3 gap-3 border-y border-white/10 py-5 text-center"><div><dt className="font-display text-3xl">{brief.diversity.sources}</dt><dd className="text-[10px] text-white/35">来源</dd></div><div><dt className="font-display text-3xl">{brief.diversity.regions}</dt><dd className="text-[10px] text-white/35">地区</dd></div><div><dt className="font-display text-3xl">{brief.diversity.evidenceTypes}</dt><dd className="text-[10px] text-white/35">证据类型</dd></div></dl>}</aside></section>}
  </div></main>
}
