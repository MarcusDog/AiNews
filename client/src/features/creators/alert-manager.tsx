import { FormEvent, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, LogIn, Plus, Send, TestTube2 } from 'lucide-react'
import { WorkspaceHeader } from '@/components/workspace-header'
import { createCreatorApi, CreatorApiError } from './creator-api'
import type { CreatorAlertData, CreatorApiClient } from './creator-types'

const verticals = [
  { id: 'ai-tech', name: 'AI 科技' }, { id: 'beauty', name: '美妆' },
  { id: 'fashion', name: '穿搭' }, { id: 'entertainment', name: '娱乐' },
]

const endpointTypes = [
  { id: 'webhook', name: '通用 Webhook' }, { id: 'feishu', name: '飞书' },
  { id: 'wecom', name: '企业微信' }, { id: 'dingtalk', name: '钉钉' },
  { id: 'telegram', name: 'Telegram' }, { id: 'ntfy', name: 'ntfy' },
  { id: 'bark', name: 'Bark' },
]

export function AlertManager({ api }: { api?: CreatorApiClient }) {
  const client = useMemo(() => api || createCreatorApi(), [api])
  const [data, setData] = useState<CreatorAlertData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'auth' | 'error'>('loading')
  const [name, setName] = useState('')
  const [vertical, setVertical] = useState('ai-tech')
  const [notice, setNotice] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [endpointType, setEndpointType] = useState('webhook')
  const [destination, setDestination] = useState('')
  const [secretRef, setSecretRef] = useState('')

  const load = () => {
    client.loadAlerts().then((value) => { setData(value); setStatus('ready') }).catch((error) => {
      setStatus(error instanceof CreatorApiError && error.status === 401 ? 'auth' : 'error')
    })
  }
  useEffect(load, [client])

  const authenticate = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    try {
      if (authMode === 'register') await client.register({ email, password, displayName })
      else await client.login({ email, password })
      setPassword('')
      setStatus('loading')
      load()
    } catch { setNotice(authMode === 'register' ? '注册失败，请检查邮箱、昵称与密码要求。' : '登录失败，请检查邮箱和密码。') }
  }

  const ensureInApp = async () => {
    if (!data) throw new Error('alerts_not_loaded')
    const existing = data.endpoints.find((endpoint) => endpoint.type === 'in_app')
    if (existing) return existing
    const endpoint = await client.createEndpoint({ type: 'in_app', destination: data.user.id })
    setData({ ...data, endpoints: [...data.endpoints, endpoint] })
    return endpoint
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const endpoint = await ensureInApp()
      const subscription = await client.createSubscription({ name: name.trim(), endpointIds: [endpoint.id], vertical, minimumScore: 70 })
      setData((current) => current ? { ...current, subscriptions: [...current.subscriptions, subscription] } : current)
      setName('')
      setNotice('订阅已创建；后续命中会进入持久投递队列。')
    } catch { setNotice('创建失败，请检查登录状态与端点配置。') }
  }

  const addEndpoint = async (event: FormEvent) => {
    event.preventDefault()
    if (!destination.trim()) return
    try {
      const endpoint = await client.createEndpoint({
        type: endpointType,
        destination: destination.trim(),
        ...(secretRef.trim() ? { secretRef: secretRef.trim() } : {}),
      })
      setData((current) => current ? { ...current, endpoints: [...current.endpoints, endpoint] } : current)
      setDestination('')
      setSecretRef('')
      setNotice('投递端点已保存。密钥只引用服务端环境变量，不会回显到页面。')
    } catch { setNotice('端点创建失败。Webhook 必须使用 HTTPS，并填写服务端密钥引用。') }
  }

  const test = async (id: string) => {
    try {
      const result = await client.testEndpoint(id)
      setNotice(result.status === 'delivered' ? '测试投递成功并已写入审计。' : `测试状态：${result.status}`)
    } catch { setNotice('测试投递失败；详情已保留在投递记录。') }
  }

  return <main className="min-h-svh bg-[#031a26] text-white">
    <WorkspaceHeader current="alerts" />
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Durable creator alerts</p>
      <h1 className="mt-3 font-display text-5xl sm:text-7xl">热点推送与订阅</h1>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-white/50">规则按垂类、平台、博主、事件类型和最低分匹配；每次投递都经过持久 outbox，可重试、审计和查看死信。</p>

      {status === 'loading' && <div className="flex min-h-72 items-center justify-center gap-3 text-white/45"><LoaderCircle className="h-5 w-5 animate-spin" />读取订阅与投递记录…</div>}
      {status === 'auth' && <section className="mt-14 max-w-xl border-y border-white/10 py-12">
        <h2 className="font-display text-3xl">登录后管理推送</h2>
        <p className="mt-3 text-sm text-white/45">公开热点不要求登录；订阅、端点和投递记录按账号隔离。</p>
        <div className="mt-6 flex gap-5 text-sm" role="tablist" aria-label="账号操作">
          <button role="tab" aria-selected={authMode === 'login'} onClick={() => setAuthMode('login')} className={authMode === 'login' ? 'text-white' : 'text-white/40'}>登录</button>
          <button role="tab" aria-selected={authMode === 'register'} onClick={() => setAuthMode('register')} className={authMode === 'register' ? 'text-white' : 'text-white/40'}>注册</button>
        </div>
        <form onSubmit={authenticate} className="mt-6 grid gap-4">
          {authMode === 'register' && <label className="grid gap-2 text-xs text-white/45">昵称<input aria-label="昵称" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" /></label>}
          <label className="grid gap-2 text-xs text-white/45">邮箱<input aria-label="邮箱" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" /></label>
          <label className="grid gap-2 text-xs text-white/45">密码<input aria-label="密码" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" /></label>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#031a26]"><LogIn className="h-4 w-4" />{authMode === 'register' ? '注册并进入' : '登录'}</button>
        </form>
        {notice && <p aria-live="polite" className="mt-5 text-xs leading-5 text-amber-100/70">{notice}</p>}
      </section>}
      {status === 'error' && <p className="mt-14 border-y border-white/10 py-12">暂时无法读取推送系统。</p>}

      {status === 'ready' && data && <div className="mt-14 grid gap-16 lg:grid-cols-[.8fr_1.2fr]">
        <section>
          <h2 className="font-display text-4xl">新建订阅</h2>
          <form onSubmit={submit} className="mt-6 grid gap-5">
            <label className="grid gap-2 text-xs text-white/45">订阅名称<input aria-label="订阅名称" value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" placeholder="例如：AI 工具爆款" /></label>
            <label className="grid gap-2 text-xs text-white/45">订阅垂类<select aria-label="订阅垂类" value={vertical} onChange={(event) => setVertical(event.target.value)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white">{verticals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#031a26]"><Send className="h-4 w-4" />创建站内订阅</button>
          </form>

          <div className="mt-10">
            <h3 className="text-sm font-medium">投递端点</h3>
            {data.endpoints.map((endpoint) => <div key={endpoint.id} className="mt-3 flex items-center justify-between border-t border-white/10 py-4 text-sm"><span>{endpoint.type} · {endpoint.enabled ? '启用' : '停用'}</span><button onClick={() => void test(endpoint.id)} className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white"><TestTube2 className="h-4 w-4" />测试</button></div>)}
            {!data.endpoints.length && <p className="mt-3 border-t border-white/10 py-4 text-xs text-white/42">尚未创建投递端点。</p>}
          </div>

          <form onSubmit={addEndpoint} className="mt-8 grid gap-4 border-t border-white/10 pt-7">
            <h3 className="text-sm font-medium">新增外部端点</h3>
            <label className="grid gap-2 text-xs text-white/45">端点类型<select aria-label="端点类型" value={endpointType} onChange={(event) => setEndpointType(event.target.value)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white">{endpointTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-2 text-xs text-white/45">HTTPS 地址或目标标识<input aria-label="端点地址" required value={destination} onChange={(event) => setDestination(event.target.value)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" placeholder="https://example.com/creator-alert" /></label>
            <label className="grid gap-2 text-xs text-white/45">服务端密钥引用（可选）<input aria-label="密钥引用" value={secretRef} onChange={(event) => setSecretRef(event.target.value)} className="rounded-xl border border-white/12 bg-[#062333] px-4 py-3 text-sm text-white" placeholder="env:AYA_CREATOR_WEBHOOK_SECRET" /><span className="text-[11px] leading-5 text-white/32">这里只保存环境变量引用，不要填写真实密钥。</span></label>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm"><Plus className="h-4 w-4" />保存端点</button>
          </form>
          {notice && <p aria-live="polite" className="mt-5 text-xs leading-5 text-emerald-100/70">{notice}</p>}
        </section>

        <section>
          <div className="flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Delivery ledger</p><h2 className="mt-2 font-display text-4xl">最近投递</h2></div><span className="text-xs text-white/35">{data.deliveries.length} 条</span></div>
          <div className="mt-6">{data.deliveries.map((delivery) => {
            const failed = ['dead', 'retry'].includes(delivery.status)
            return <article key={delivery.id} className="border-t border-white/10 py-5"><div className="flex items-center justify-between gap-4"><h3 className="text-sm font-medium">{failed ? '投递失败' : delivery.status === 'delivered' ? '投递成功' : '等待投递'}</h3><span className={`source-status ${failed ? 'source-status-offline' : delivery.status === 'delivered' ? 'source-status-online' : 'source-status-pending'}`}>{delivery.status}</span></div><p className="mt-2 text-xs text-white/42">{delivery.eventType} · 尝试 {delivery.attemptCount} 次</p>{delivery.latestAttempt && <p className="mt-2 text-xs text-white/48">{delivery.latestAttempt.responseCode ? `HTTP ${delivery.latestAttempt.responseCode}` : '网络错误'}{delivery.latestAttempt.error ? ` · ${delivery.latestAttempt.error}` : ''}</p>}</article>
          })}{!data.deliveries.length && <p className="border-y border-white/10 py-8 text-sm text-white/42">暂无投递记录。</p>}</div>
        </section>
      </div>}
    </div>
  </main>
}
