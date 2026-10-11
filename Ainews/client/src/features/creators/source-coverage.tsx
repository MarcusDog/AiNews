import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { createCreatorApi } from './creator-api'
import type { CreatorApiClient, CreatorSource } from './creator-types'

const labels: Record<string, string> = {
  online: '在线', degraded: '降级', offline: '离线', unconfigured: '未配置',
  disabled: '已停用', pending: '待验证', partial: '部分可用', blocked: '受限',
}

export function SourceCoverage({ api }: { api?: CreatorApiClient }) {
  const client = useMemo(() => api || createCreatorApi(), [api])
  const [sources, setSources] = useState<CreatorSource[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const load = () => {
    setStatus('loading')
    client.loadSources().then((items) => { setSources(items); setStatus(items.length ? 'ready' : 'empty') }).catch(() => setStatus('error'))
  }
  useEffect(load, [client])
  return <main className="min-h-svh bg-[#031a26] text-white"><WorkspaceHeader current="sources" /><div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Source and account coverage</p><h1 className="mt-3 font-display text-5xl sm:text-7xl">来源与采集状态</h1><p className="mt-5 max-w-3xl text-sm leading-7 text-white/50">“支持接入”“已配置”“最近成功”分开呈现。未配置、风控受限和零结果不会显示成在线。</p>{status === 'loading' && <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-white/45"><LoaderCircle className="h-5 w-5 animate-spin" />核对来源与账号…</div>}{status === 'error' && <div className="py-20 text-center"><p>来源状态暂时不可用。</p><button onClick={load} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm"><RefreshCw className="h-4 w-4" />重试</button></div>}{status === 'empty' && <p className="mt-16 border-y border-white/10 py-10 text-sm text-white/45">当前没有已登记的 Creator 来源。</p>}{status === 'ready' && <section className="mt-14"><div className="hidden grid-cols-[1.2fr_.7fr_.8fr_.7fr_.8fr_1.4fr] gap-4 border-b border-white/10 pb-3 text-[10px] uppercase tracking-[0.14em] text-white/32 md:grid"><span>来源</span><span>状态</span><span>账号</span><span>帖子</span><span>最近成功</span><span>限制 / 下一步</span></div>{sources.map((source) => <article key={source.id} className="grid gap-3 border-b border-white/10 py-5 text-sm md:grid-cols-[1.2fr_.7fr_.8fr_.7fr_.8fr_1.4fr] md:gap-4"><div><p className="font-medium">{source.platform}</p><p className="mt-1 text-xs text-white/35">{source.tier} · {source.id}</p></div><div><span className={`source-status source-status-${source.status}`}>{labels[source.status] || source.status}</span></div><p className="text-white/58">{source.enabledAccountCount}/{source.accountCount}</p><p className="text-white/58">{source.postCount}</p><p className="text-xs leading-5 text-white/42">{source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString('zh-CN') : '从未成功'}</p><div className="text-xs leading-5 text-white/48">{source.lastFailureCode && <p className="text-rose-100/70">{source.lastFailureCode}</p>}{source.setupHint && <p>{source.setupHint}</p>}{!source.setupHint && !source.lastFailureCode && <p>暂无额外限制</p>}</div></article>)}</section>}</div></main>
}
