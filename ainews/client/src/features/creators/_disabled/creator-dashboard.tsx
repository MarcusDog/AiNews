import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, RefreshCw, Users } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { createCreatorApi } from './creator-api'
import type {
  CreatorApiClient, CreatorDashboardData, CreatorPost, CreatorStreamFactory,
  CreatorTab, CreatorTopic, CreatorWindow,
} from './creator-types'

const windows: CreatorWindow[] = ['24h', '48h', '72h']
const eventTypes = ['post.published', 'post.hot', 'topic.multi_creator', 'topic.cross_platform']

function dateText(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function PostCard({ post }: { post: CreatorPost }) {
  return <article className="border-t border-white/12 py-7 sm:grid sm:grid-cols-[1fr_160px] sm:gap-8">
    <div>
      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-white/38"><span>{post.platform}</span><span>·</span><a className="hover:text-white" href={`/creators/${encodeURIComponent(post.creatorId)}`}>{post.creatorName}</a><span>·</span><time>{dateText(post.publishedAt)}</time></div>
      <h3 className="mt-3 text-xl font-medium leading-snug text-white">{post.title}</h3>
      {post.text && <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/48">{post.text}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <a href={post.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-xs text-white/65 hover:text-white">打开原帖 <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        {post.hotness && <details className="text-xs text-white/50"><summary className="cursor-pointer hover:text-white">展开评分公式</summary><div className="mt-3 grid gap-1 rounded-lg border border-white/10 bg-white/[0.025] p-3">{Object.entries(post.hotness.components).map(([key, value]) => <span key={key}>{key} {value ?? '未知'}</span>)}{Object.entries(post.hotness.penalties).map(([key, value]) => <span key={key} className="text-amber-100/65">{key} {value ?? '未知'}</span>)}</div></details>}
      </div>
    </div>
    <div className="mt-5 sm:mt-0 sm:text-right">{post.hotness ? <><span className="font-display text-5xl">{post.hotness.score}</span><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35">{post.hotness.formulaVersion}<br />{post.hotness.confidence}</p></> : <p className="text-xs text-white/35">暂无可复算热度</p>}</div>
  </article>
}

function TopicCard({ topic }: { topic: CreatorTopic }) {
  return <article className="border-t border-white/12 py-7 sm:grid sm:grid-cols-[1fr_180px] sm:gap-8"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/38">{topic.creatorCount} 位博主 · {topic.platformCount} 个平台 · {dateText(topic.latestSeenAt)}</p><h3 className="mt-3 text-xl font-medium leading-snug">{topic.title}</h3>{topic.summary && <p className="mt-3 text-sm leading-6 text-white/48">{topic.summary}</p>}<div className="mt-5 flex flex-wrap gap-4">{topic.evidence.slice(0, 3).map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer noopener" className="text-xs text-white/60 hover:text-white">证据 {index + 1} ↗</a>)}</div></div><div className="mt-5 sm:mt-0 sm:text-right"><span className="font-display text-5xl">{topic.hotness ?? '—'}</span><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35">{topic.formulaVersion}</p></div></article>
}

export function CreatorDashboard({ api, initialVertical = 'ai-tech', streamFactory }: {
  api?: CreatorApiClient
  initialVertical?: string
  streamFactory?: CreatorStreamFactory
}) {
  const client = useMemo(() => api || createCreatorApi(), [api])
  const [vertical, setVertical] = useState(initialVertical)
  const [window, setWindow] = useState<CreatorWindow>('72h')
  const [tab, setTab] = useState<CreatorTab>('posts')
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [data, setData] = useState<CreatorDashboardData | null>(null)
  const [liveCount, setLiveCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading')
    try {
      const result = await client.loadDashboard({ vertical, window, signal })
      setData(result)
      setStatus(result.posts.items.length || result.topics.items.length || result.creators.items.length ? 'ready' : 'empty')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('error')
    }
  }, [client, vertical, window])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    let stream: ReturnType<CreatorStreamFactory> | null = null
    let cancelled = false
    void client.canStream().then((allowed) => {
      if (!allowed || cancelled) return
      const factory = streamFactory || ((url: string) => new EventSource(url))
      if (!streamFactory && typeof EventSource === 'undefined') return
      const params = new URLSearchParams()
      if (vertical !== 'all') params.set('vertical', vertical)
      stream = factory(`/api/creators/v1/stream${params.size ? `?${params}` : ''}`)
      const listener = ((event: MessageEvent) => {
        try {
          const incoming = JSON.parse(event.data) as { verticalId?: string }
          if (vertical !== 'all' && incoming.verticalId && incoming.verticalId !== vertical) return
          setLiveCount((count) => count + 1)
          void client.loadDashboard({ vertical, window }).then((result) => setData(result))
        } catch { /* Ignore malformed realtime frames; persisted API stays authoritative. */ }
      }) as EventListener
      eventTypes.forEach((type) => stream?.addEventListener(type, listener))
    })
    return () => { cancelled = true; stream?.close() }
  }, [client, streamFactory, vertical, window])

  const loadMore = async () => {
    if (!data) return
    setLoadingMore(true)
    try {
      if (tab === 'posts' && data.posts.nextCursor) {
        const page = await client.loadPosts({ vertical, window, cursor: data.posts.nextCursor })
        setData({ ...data, posts: { items: [...data.posts.items, ...page.items], nextCursor: page.nextCursor } })
      }
      if (tab === 'topics' && data.topics.nextCursor) {
        const page = await client.loadTopics({ vertical, window, cursor: data.topics.nextCursor })
        setData({ ...data, topics: { items: [...data.topics.items, ...page.items], nextCursor: page.nextCursor } })
      }
    } finally { setLoadingMore(false) }
  }

  const verticalName = data?.verticals.find((item) => item.id === vertical)?.name || vertical
  return <main className="min-h-svh bg-[#031a26] text-white"><WorkspaceHeader current="creators" /><div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Cross-vertical creator intelligence</p><div className="mt-3 grid gap-5 md:grid-cols-[1fr_360px] md:items-end"><div><h1 className="font-display text-5xl sm:text-7xl">博主与爆款雷达</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-white/50">只展示观察名单中实际采集的公开帖子、互动快照和可打开证据。没有数据时不生成示例热点。</p></div><p className="text-sm leading-6 text-white/42 md:text-right"><Users className="mr-2 inline h-4 w-4" />{data?.creators.items.length ?? 0} 位当前可见博主</p></div>

    <div className="mt-12 border-y border-white/10 py-5"><div className="flex flex-wrap gap-2" aria-label="垂类筛选"><button type="button" aria-pressed={vertical === 'all'} onClick={() => setVertical('all')} className={`rounded-full px-4 py-2 text-xs ${vertical === 'all' ? 'bg-white text-[#031a26]' : 'border border-white/12 text-white/55'}`}>全部</button>{data?.verticals.map((item) => <button key={item.id} type="button" aria-pressed={vertical === item.id} onClick={() => setVertical(item.id)} className={`rounded-full px-4 py-2 text-xs ${vertical === item.id ? 'bg-white text-[#031a26]' : 'border border-white/12 text-white/55'}`}>{item.name}</button>)}</div><div className="mt-4 flex gap-2" aria-label="时间窗口">{windows.map((item) => <button key={item} type="button" aria-pressed={window === item} onClick={() => setWindow(item)} className={`rounded-full px-4 py-2 text-xs ${window === item ? 'bg-white/12 text-white' : 'text-white/42'}`}>{item.replace('h', ' 小时')}</button>)}</div></div>

    <p className="sr-only" aria-live="polite">{liveCount ? `收到 ${liveCount} 条 ${verticalName}实时更新` : ''}</p>
    {status === 'loading' && <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-white/45"><LoaderCircle className="h-5 w-5 animate-spin" />正在读取真实博主内容…</div>}
    {status === 'error' && <div className="min-h-72 py-20 text-center"><h2 className="font-display text-3xl">创作者情报暂时不可用</h2><p className="mt-3 text-sm text-white/45">现有数据不会被示例内容替代。</p><button onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm"><RefreshCw className="h-4 w-4" />重试</button></div>}
    {status === 'empty' && <div className="min-h-72 py-20 text-center"><h2 className="font-display text-3xl">当前垂类暂无已采集内容</h2><p className="mt-3 text-sm text-white/45">请查看来源页的账号状态，或切换时间窗口。</p></div>}
    {status === 'ready' && data && <section className="mt-12"><div className="flex items-end justify-between border-b border-white/10"><div role="tablist" aria-label="情报类型" className="flex gap-6"><button role="tab" aria-selected={tab === 'posts'} onClick={() => setTab('posts')} className={`pb-4 text-sm ${tab === 'posts' ? 'border-b border-white text-white' : 'text-white/42'}`}>爆款帖子</button><button role="tab" aria-selected={tab === 'topics'} onClick={() => setTab('topics')} className={`pb-4 text-sm ${tab === 'topics' ? 'border-b border-white text-white' : 'text-white/42'}`}>共题热点</button></div>{vertical !== 'all' && <a href={`/verticals/${encodeURIComponent(vertical)}`} className="pb-4 text-xs text-white/42 hover:text-white">垂类详情 →</a>}</div>{tab === 'posts' && !data.posts.items.length && <div className="border-b border-white/10 py-12 text-center"><p className="text-sm text-white/55">当前窗口暂无达到爆款阈值的帖子</p><p className="mt-2 text-xs text-white/35">互动快照不足或得分未达阈值；普通公开帖子仍可在博主详情中查看。</p></div>}{tab === 'topics' && !data.topics.items.length && <div className="border-b border-white/10 py-12 text-center"><p className="text-sm text-white/55">当前窗口暂无多博主共题</p><p className="mt-2 text-xs text-white/35">系统不会把单来源内容包装成跨平台趋势。</p></div>}{tab === 'posts' ? data.posts.items.map((post) => <PostCard key={post.id} post={post} />) : data.topics.items.map((topic) => <TopicCard key={topic.id} topic={topic} />)}{((tab === 'posts' && data.posts.nextCursor) || (tab === 'topics' && data.topics.nextCursor)) && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-8 rounded-full border border-white/15 px-5 py-2.5 text-sm disabled:opacity-50">{loadingMore ? '加载中…' : tab === 'posts' ? '加载更多帖子' : '加载更多主题'}</button>}<section className="mt-20"><p className="text-[10px] uppercase tracking-[0.2em] text-white/38">Verified watchlist</p><h2 className="mt-3 font-display text-4xl">当前博主</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.creators.items.map((creator) => <a href={`/creators/${encodeURIComponent(creator.id)}`} key={creator.id} className="border-t border-white/10 py-5 hover:border-white/30"><h3 className="font-medium">{creator.displayName}</h3><p className="mt-2 text-xs text-white/42">{creator.accountCount} 个账号 · 最近 {dateText(creator.latestPostAt)}</p></a>)}</div></section></section>}
  </div></main>
}
