import { useEffect, useState } from 'react'
import { WorkspaceHeader } from './workspace-header'

interface SourceCoverage {
  id: string
  platform: string
  support: string | null
  configured: boolean
  schedulable: boolean
  status: string
  latestSuccess: string | null
  lastFailure: string | null
  accountCount: number
  postCount: number
  coverage: string | null
  reason: string | null
}

interface CoverageSummary {
  verifiedCreators: number
  enabledAccounts: number
  posts: number
  topics: number
  lastCollectedAt: string | null
}

const PLATFORM_LABEL: Record<string, string> = {
  github: 'GitHub Releases',
  youtube: 'YouTube Feed',
  x: 'X (Twitter)',
  mastodon: 'Mastodon',
  hacker_news: 'Hacker News',
  huggingface: 'Hugging Face',
  bilibili: 'Bilibili',
  json_bridge: 'JSON Bridge',
  rss_signal: 'RSS Signal',
  mastodon_account: 'Mastodon Account',
  newsnow: 'NewsNow'
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

export function SourceCoverage() {
  const [items, setItems] = useState<SourceCoverage[]>([])
  const [summary, setSummary] = useState<CoverageSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let aborted = false
    const ctrl = new AbortController()
    fetch('/api/creators/v1/sources', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((payload) => {
        if (aborted) return
        const list = Array.isArray(payload?.data?.items) ? (payload.data.items as SourceCoverage[]) : []
        setItems(list)
        setSummary((payload?.data?.summary as CoverageSummary) || null)
        setStatus(list.length ? 'ready' : 'empty')
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!aborted) setStatus('error')
      })
    return () => { aborted = true; ctrl.abort() }
  }, [])

  return (
    <main className="min-h-svh bg-[#031a26] text-white">
      <WorkspaceHeader current="sources" right={summary ? `已采集 ${summary.posts} 条` : undefined} />
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Cross-vertical sources</p>
        <h1 className="mt-3 font-display text-5xl sm:text-7xl">来源覆盖与观察名单</h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/55">
          不同 tier 的源对应不同的接入门槛。L1 默认开启；L2 / L3 需要凭据；L4 仅在 sidecar 注入时使用。
          状态列同时区分 <code className="rounded bg-white/10 px-1.5 py-0.5">configured</code> 与
          <code className="ml-1 rounded bg-white/10 px-1.5 py-0.5">observed</code>，避免把未配置源当成失败。
        </p>

        {status === 'loading' && <div className="mt-12 border-t border-white/10 py-12 text-center text-sm text-white/45">读取来源状态…</div>}
        {status === 'error' && <div className="mt-12 border-t border-white/10 py-12 text-center text-sm text-white/45">来源页暂不可用，未被示例数据替代。</div>}
        {status === 'empty' && (
          <div className="mt-12 border-t border-white/10 py-12 text-center text-sm text-white/45">
            当前未配置任何 Creator 来源。先到 <code className="rounded bg-white/10 px-1.5 py-0.5">server/config/signalSources.js</code> 启用。
          </div>
        )}

        {status === 'ready' && summary && (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard label="核验博主" value={summary.verifiedCreators} />
            <SummaryCard label="启用账号" value={summary.enabledAccounts} />
            <SummaryCard label="已采集帖子" value={summary.posts} />
            <SummaryCard label="最近一次采集" value={fmt(summary.lastCollectedAt)} mono />
          </div>
        )}

        {status === 'ready' && items.length > 0 && (
          <section className="mt-12">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">Per-source status</p>
            <table className="mt-4 w-full border-collapse text-sm">
              <thead className="border-b border-white/15 text-left text-[10px] uppercase tracking-[0.14em] text-white/45">
                <tr>
                  <th className="py-3 pr-4">来源</th>
                  <th className="py-3 pr-4">层级</th>
                  <th className="py-3 pr-4">配置</th>
                  <th className="py-3 pr-4">状态</th>
                  <th className="py-3 pr-4">账号</th>
                  <th className="py-3 pr-4">帖子</th>
                  <th className="py-3 pr-4">最近成功</th>
                </tr>
              </thead>
              <tbody>
                {items.map((src) => (
                  <tr key={src.id} className="border-b border-white/8">
                    <td className="py-3 pr-4">{PLATFORM_LABEL[src.platform] || src.platform}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{src.support || '—'}</td>
                    <td className="py-3 pr-4">{src.configured ? '已配置' : '未配置'}</td>
                    <td className="py-3 pr-4">{src.status}</td>
                    <td className="py-3 pr-4">{src.accountCount}</td>
                    <td className="py-3 pr-4">{src.postCount}</td>
                    <td className="py-3 pr-4">{fmt(src.latestSuccess)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-16 border-t border-white/10 pt-8 text-sm text-white/50">
          <p>详细接入文档：<a className="text-white/70 hover:underline" href="/docs/CREATOR_SOURCES.md">CREATOR_SOURCES.md</a> · <a className="text-white/70 hover:underline" href="/docs/CREATOR_SIDECAR.md">CREATOR_SIDECAR.md</a> · <a className="text-white/70 hover:underline" href="/docs/SYSTEM_USAGE_GUIDE.md">SYSTEM_USAGE_GUIDE.md</a></p>
        </section>
      </div>
    </main>
  )
}

function SummaryCard({ label, value, mono }: { label: string; value: number | string; mono?: boolean }) {
  return (
    <div className="border-t border-white/10 pt-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className={`mt-2 ${mono ? 'font-mono text-base' : 'font-display text-4xl'} text-white`}>{value}</p>
    </div>
  )
}