import { useEffect, useState } from 'react'

interface CreatorSummary {
  id: string
  displayName: string
  verticalIds: string[]
  accountCount: number
  latestPostAt: string | null
}

interface CreatorPost {
  id: string
  url: string
  title: string
  publishedAt: string
  platform: string
  hotness: {
    formulaVersion: string
    score: number
    confidence: string
  } | null
}

interface CreatorTopic {
  id: string
  title: string
  creatorCount: number
  hotness: number | null
  formulaVersion: string
  latestSeenAt: string
}

const WINDOWS = ['24h', '48h', '72h'] as const

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function CreatorSection() {
  const [window, setWindow] = useState<typeof WINDOWS[number]>('72h')
  const [creators, setCreators] = useState<CreatorSummary[]>([])
  const [posts, setPosts] = useState<CreatorPost[]>([])
  const [topics, setTopics] = useState<CreatorTopic[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let aborted = false
    const ctrl = new AbortController()
    async function load() {
      setStatus('loading')
      try {
        const since = new Date(Date.now() - ({ '24h': 24, '48h': 48, '72h': 72 }[window] * 3_600_000)).toISOString()
        const [creatorsRes, postsRes, topicsRes] = await Promise.all([
          fetch(`/api/creators/v1/creators?status=verified&vertical=ai-tech&limit=12`, { signal: ctrl.signal }),
          fetch(`/api/creators/v1/posts?hot=true&since=${encodeURIComponent(since)}&limit=8`, { signal: ctrl.signal }),
          fetch(`/api/creators/v1/topics?window=${window}&limit=8`, { signal: ctrl.signal })
        ])
        const [creatorsPayload, postsPayload, topicsPayload] = await Promise.all([
          creatorsRes.json(), postsRes.json(), topicsRes.json()
        ])
        if (aborted) return
        const list = (p: { data?: { items?: unknown[] } }) => Array.isArray(p?.data?.items) ? p.data.items as unknown[] : []
        setCreators(list(creatorsPayload) as CreatorSummary[])
        setPosts(list(postsPayload) as CreatorPost[])
        setTopics(list(topicsPayload) as CreatorTopic[])
        const total = list(creatorsPayload).length + list(postsPayload).length + list(topicsPayload).length
        setStatus(total > 0 ? 'ready' : 'empty')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!aborted) setStatus('error')
      }
    }
    void load()
    return () => { aborted = true; ctrl.abort() }
  }, [window])

  return (
    <section data-testid="creator-shell" className="relative bg-[#031a26] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">PR #1 · Cross-vertical creator intelligence</p>
        <div className="mt-3 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="font-display text-5xl sm:text-6xl">博主与爆款雷达</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/55">
              来自已核实观察名单的公开帖子、热点分数与跨创作者共题。当前数据来自 GitHub Releases 公开 feed（ai-tech 垂类）。
            </p>
          </div>
          <div className="flex gap-2" role="group" aria-label="时间窗口">
            {WINDOWS.map((w) => (
              <button key={w} type="button" onClick={() => setWindow(w)}
                className={`rounded-full px-4 py-2 text-xs ${window === w ? 'bg-white text-[#031a26]' : 'border border-white/15 text-white/55'}`}>
                {w.replace('h', ' 小时')}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && (
          <div className="mt-12 border-t border-white/10 py-16 text-center text-sm text-white/45">正在读取真实博主内容…</div>
        )}
        {status === 'error' && (
          <div className="mt-12 border-t border-white/10 py-16 text-center text-sm text-white/45">
            创作者情报暂时不可用，未被示例数据替代。
          </div>
        )}
        {status === 'empty' && (
          <div className="mt-12 border-t border-white/10 py-16 text-center text-sm text-white/45">
            当前时间窗口暂无已采集内容，可切换窗口或稍后再来。
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="mt-12 grid gap-10 lg:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">Verified watchlist · {creators.length} creators</p>
                <h3 className="mt-3 font-display text-3xl">当前博主</h3>
                <div className="mt-4 divide-y divide-white/10">
                  {creators.map((c) => (
                    <a key={c.id} href={`/creators/${encodeURIComponent(c.id)}`} className="block py-4 hover:bg-white/[0.025]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-base">{c.displayName}</span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">{c.accountCount} 账号</span>
                      </div>
                      <p className="mt-1 text-xs text-white/42">最近发布：{fmtDate(c.latestPostAt)}</p>
                    </a>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">Cross-creator topics · {topics.length}</p>
                <h3 className="mt-3 font-display text-3xl">共题热点</h3>
                <div className="mt-4 divide-y divide-white/10">
                  {topics.map((t) => (
                    <div key={t.id} className="py-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-base">{t.title}</span>
                        <span className="font-display text-2xl">{t.hotness ?? '—'}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/42">{t.creatorCount} 位博主 · {t.formulaVersion} · {fmtDate(t.latestSeenAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-12">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">Hot posts · {posts.length}</p>
              <h3 className="mt-3 font-display text-3xl">爆款帖子</h3>
              <div className="mt-4 divide-y divide-white/10">
                {posts.map((p) => (
                  <article key={p.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_120px]">
                    <div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-white/42">
                        <span>{p.platform}</span>
                        <span>·</span>
                        <time>{fmtDate(p.publishedAt)}</time>
                      </div>
                      <h4 className="mt-2 text-lg font-medium leading-snug">{p.title}</h4>
                      <a href={p.url} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block text-xs text-white/55 hover:text-white">
                        打开原帖 ↗
                      </a>
                    </div>
                    <div className="text-left sm:text-right">
                      {p.hotness ? (
                        <>
                          <span className="font-display text-5xl">{p.hotness.score}</span>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/38">
                            {p.hotness.formulaVersion}<br />{p.hotness.confidence}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-white/35">暂无评分</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-12 border-t border-white/10 pt-8 text-sm text-white/50">
              <p>
                完整使用方案见
                {' '}<a href="/docs/SYSTEM_USAGE_GUIDE.md" className="text-white/70 underline-offset-4 hover:underline">SYSTEM_USAGE_GUIDE.md</a>
                {' '}· Creator 来源/观察名单/Sidecar 接入详见
                {' '}<a href="/docs/CREATOR_SOURCES.md" className="text-white/70 underline-offset-4 hover:underline">CREATOR_SOURCES.md</a>
                {' '}·{' '}
                <a href="/api/creators/v1/capabilities" className="text-white/70 underline-offset-4 hover:underline">API capabilities</a>
              </p>
              <p className="mt-2 text-xs text-white/35">
                系统不会用示例数据替代缺失项；hotness 是 creator-hotness-v1 公式在当前样本上的排名，不是全网流行度证明。
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  )
}