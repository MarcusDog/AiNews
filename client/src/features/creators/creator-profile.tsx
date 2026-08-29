import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { createCreatorApi } from './creator-api'
import type { CreatorApiClient, CreatorDetail, CreatorPost } from './creator-types'

const stateLabel: Record<string, string> = { complete: '完整历史', partial: '部分历史', blocked: '受限', running: '回填中', pending: '待回填' }

export function CreatorProfile({ id, api }: { id: string; api?: CreatorApiClient }) {
  const client = useMemo(() => api || createCreatorApi(), [api])
  const [detail, setDetail] = useState<CreatorDetail | null>(null)
  const [posts, setPosts] = useState<CreatorPost[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([client.loadCreator(id, controller.signal), client.loadCreatorPosts(id, null, controller.signal)])
      .then(([creator, page]) => { setDetail(creator); setPosts(page.items); setStatus('ready') })
      .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('error') })
    return () => controller.abort()
  }, [client, id])
  return <main className="min-h-svh bg-[#031a26] text-white"><WorkspaceHeader current="creators" /><div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">{status === 'loading' && <div className="flex min-h-72 items-center justify-center gap-3 text-white/45"><LoaderCircle className="h-5 w-5 animate-spin" />读取博主公开历史…</div>}{status === 'error' && <h1 className="font-display text-5xl">无法读取该博主</h1>}{status === 'ready' && detail && <><p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Verified creator profile</p><h1 className="mt-3 font-display text-5xl sm:text-7xl">{detail.displayName}</h1><p className="mt-5 text-sm text-white/45">{detail.verticalIds.join(' / ')} · {detail.accounts.length} 个公开账号</p><section className="mt-12 grid gap-4 lg:grid-cols-2">{detail.accounts.map((account) => <article key={account.id} className="border-t border-white/12 py-6"><div className="flex items-center justify-between gap-4"><a href={account.profileUrl} target="_blank" rel="noreferrer noopener" className="font-medium hover:text-white/70">{account.platform} {account.handle || ''} ↗</a><span className="rounded-full border border-white/14 px-3 py-1 text-[10px] text-white/55">{stateLabel[account.backfill.state] || account.backfill.state}</span></div><p className="mt-3 text-xs leading-5 text-white/42">已保存 {account.postCount} 条 · 回填 {account.backfill.pagesFetched} 页 / {account.backfill.itemsFetched} 条</p>{account.backfill.historyLimitReason && <p className="mt-3 border-l border-amber-100/30 pl-3 text-xs leading-5 text-amber-50/70">{account.backfill.historyLimitReason}</p>}</article>)}</section><section className="mt-16"><h2 className="font-display text-4xl">最近帖子</h2><div className="mt-5 divide-y divide-white/10 border-t border-white/10">{posts.map((post) => <a key={post.id} href={post.url} target="_blank" rel="noreferrer noopener" className="grid gap-2 py-5 hover:text-white/70 sm:grid-cols-[1fr_160px]"><span>{post.title}</span><span className="text-xs text-white/38 sm:text-right">{post.platform} · {post.hotness?.score ?? '未评分'}</span></a>)}{!posts.length && <p className="py-8 text-sm text-white/42">尚未保存公开帖子。</p>}</div></section></>}</div></main>
}
