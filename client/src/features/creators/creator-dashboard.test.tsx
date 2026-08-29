import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App.tsx'
import { CreatorApiError } from './creator-api'
import { CreatorDashboard } from './creator-dashboard'
import { SourceCoverage } from './source-coverage'
import { AlertManager } from './alert-manager'
import type { CreatorApiClient, CreatorDashboardData } from './creator-types'

const dashboard: CreatorDashboardData = {
  verticals: [
    { id: 'ai-tech', name: 'AI 科技', creatorCount: 2, postCount: 12 },
    { id: 'beauty', name: '美妆', creatorCount: 1, postCount: 4 },
  ],
  creators: { items: [{ id: 'creator-a', displayName: 'Alice AI', kind: 'person', reviewStatus: 'verified', verticalIds: ['ai-tech'], accountCount: 2, latestPostAt: '2026-08-29T11:00:00.000Z' }], nextCursor: null },
  posts: { items: [{
    id: 'post-a', creatorId: 'creator-a', creatorName: 'Alice AI', platform: 'youtube',
    url: 'https://youtube.com/watch?v=a', title: 'Agent 工具真实实测', text: '完整实测内容',
    publishedAt: '2026-08-29T11:00:00.000Z', verticalIds: ['ai-tech'],
    hotness: { formulaVersion: 'creator-hotness-v1', score: 88, confidence: 'high', components: { velocity: 30, creatorRelative: 22 }, penalties: { advertisement: 0 } },
  }], nextCursor: 'post-next' },
  topics: { items: [{ id: 'topic-a', verticalId: 'ai-tech', title: '三位博主同时实测 Agent 工具', summary: '跨平台扩散', latestSeenAt: '2026-08-29T11:00:00.000Z', hotness: 91, formulaVersion: 'creator-topic-v1', creatorCount: 3, platformCount: 2, evidence: [{ postId: 'post-a', url: 'https://youtube.com/watch?v=a' }] }], nextCursor: 'topic-next' },
}

function api(overrides: Partial<CreatorApiClient> = {}): CreatorApiClient {
  return {
    loadDashboard: vi.fn(async () => dashboard),
    loadPosts: vi.fn(async () => ({ items: [{ ...dashboard.posts.items[0], id: 'post-b', title: '第二条真实帖子' }], nextCursor: null })),
    loadTopics: vi.fn(async () => ({ items: dashboard.topics.items, nextCursor: null })),
    loadCreator: vi.fn(async () => ({ ...dashboard.creators.items[0], accounts: [{ id: 'account-a', platform: 'youtube', profileUrl: 'https://youtube.com/@alice', enabled: true, authState: 'not_required', postCount: 10, backfill: { state: 'partial', historyLimitReason: 'youtube_history_window', pagesFetched: 2, itemsFetched: 10 } }] })),
    loadCreatorPosts: vi.fn(async () => dashboard.posts),
    loadSources: vi.fn(async () => [{ id: 'x', platform: 'x', tier: 'L2', configured: false, schedulable: true, status: 'unconfigured', setupHint: '配置 X_BEARER_TOKEN', accountCount: 1, enabledAccountCount: 1, postCount: 0 }]),
    loadAlerts: vi.fn(async () => ({ user: { id: 'user-a' }, endpoints: [{ id: 'endpoint-a', type: 'in_app', destination: 'user-a', enabled: true }], subscriptions: [], deliveries: [{ id: 'delivery-a', endpointId: 'endpoint-a', status: 'dead', attemptCount: 3, eventType: 'post.hot', createdAt: '2026-08-29T10:00:00.000Z', latestAttempt: { attemptedAt: '2026-08-29T10:01:00.000Z', status: 'dead', responseCode: 400, error: 'http_400' } }] })),
    createEndpoint: vi.fn(async () => ({ id: 'endpoint-new', type: 'in_app', destination: 'user-a', enabled: true })),
    createSubscription: vi.fn(async () => ({ id: 'subscription-new' })),
    testEndpoint: vi.fn(async () => ({ status: 'delivered' })),
    canStream: vi.fn(async () => false),
    login: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('Creator Intelligence workspaces', () => {
  it('switches vertical/window/tab, opens original evidence, expands formula and loads the next cursor', async () => {
    const user = userEvent.setup()
    const client = api()
    render(<CreatorDashboard api={client} />)
    expect(await screen.findByRole('heading', { name: 'Agent 工具真实实测' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '美妆' }))
    await waitFor(() => expect(client.loadDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ vertical: 'beauty' })))
    await user.click(screen.getByRole('button', { name: '24 小时' }))
    await waitFor(() => expect(client.loadDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ window: '24h' })))
    await user.click(screen.getByRole('tab', { name: '共题热点' }))
    expect(screen.getByRole('heading', { name: '三位博主同时实测 Agent 工具' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '爆款帖子' }))
    expect(screen.getByRole('link', { name: '打开原帖' })).toHaveAttribute('href', 'https://youtube.com/watch?v=a')
    await user.click(screen.getByText('展开评分公式'))
    expect(screen.getByText(/velocity 30/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载更多帖子' }))
    expect(await screen.findByRole('heading', { name: '第二条真实帖子' })).toBeInTheDocument()
  })

  it('renders creator profile partial history, source configuration states and standalone routes', async () => {
    const client = api()
    const profile = render(<App path="/creators/creator-a" creatorApi={client} />)
    expect(await screen.findByRole('heading', { name: 'Alice AI' })).toBeInTheDocument()
    expect(screen.getByText('部分历史')).toBeInTheDocument()
    profile.unmount()

    const sources = render(<SourceCoverage api={client} />)
    expect(await screen.findByText('未配置')).toBeInTheDocument()
    expect(screen.getByText('配置 X_BEARER_TOKEN')).toBeInTheDocument()
    sources.unmount()

    render(<App path="/verticals/beauty" creatorApi={client} />)
    await waitFor(() => expect(client.loadDashboard).toHaveBeenCalledWith(expect.objectContaining({ vertical: 'beauty' })))
  })

  it('distinguishes degraded and blocked source states from configured success', async () => {
    const client = api({ loadSources: vi.fn(async () => [
      { id: 'youtube', platform: 'youtube', tier: 'L2', configured: true, schedulable: true, status: 'degraded', lastFailureCode: 'quota_exhausted', accountCount: 2, enabledAccountCount: 2, postCount: 4 },
      { id: 'xiaohongshu', platform: 'xiaohongshu', tier: 'L4', configured: true, schedulable: false, status: 'blocked', setupHint: '登录态需要人工维护', accountCount: 1, enabledAccountCount: 1, postCount: 0 },
    ]) })
    render(<SourceCoverage api={client} />)
    expect(await screen.findByText('降级')).toBeInTheDocument()
    expect(screen.getByText('受限')).toBeInTheDocument()
    expect(screen.getByText('quota_exhausted')).toBeInTheDocument()
    expect(screen.getByText('登录态需要人工维护')).toBeInTheDocument()
  })

  it('never replaces empty or failed dashboards with fabricated examples', async () => {
    const empty = api({ loadDashboard: vi.fn(async () => ({ verticals: [], creators: { items: [], nextCursor: null }, posts: { items: [], nextCursor: null }, topics: { items: [], nextCursor: null } })) })
    const emptyView = render(<CreatorDashboard api={empty} />)
    expect(await screen.findByRole('heading', { name: '当前垂类暂无已采集内容' })).toBeInTheDocument()
    emptyView.unmount()

    const failed = api({ loadDashboard: vi.fn(async () => { throw new Error('offline') }) })
    render(<CreatorDashboard api={failed} />)
    expect(await screen.findByRole('heading', { name: '创作者情报暂时不可用' })).toBeInTheDocument()
    expect(screen.queryByText('Agent 工具真实实测')).not.toBeInTheDocument()
  })

  it('shows failed delivery details and creates a vertical subscription', async () => {
    const user = userEvent.setup()
    const client = api()
    render(<AlertManager api={client} />)
    expect(await screen.findByText('投递失败')).toBeInTheDocument()
    expect(screen.getByText(/HTTP 400/)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '订阅名称' }), 'AI 每日爆款')
    await user.selectOptions(screen.getByRole('combobox', { name: '订阅垂类' }), 'ai-tech')
    await user.click(screen.getByRole('button', { name: '创建站内订阅' }))
    expect(client.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ name: 'AI 每日爆款', vertical: 'ai-tech', endpointIds: ['endpoint-a'] }))
  })

  it('authenticates inline and creates an external endpoint without exposing secret values', async () => {
    const user = userEvent.setup()
    let signedIn = false
    const client = api({
      loadAlerts: vi.fn(async () => {
        if (!signedIn) throw new CreatorApiError('auth_required', 'auth_required', 401)
        return { user: { id: 'user-a' }, endpoints: [], subscriptions: [], deliveries: [] }
      }),
      login: vi.fn(async () => { signedIn = true }),
      createEndpoint: vi.fn(async (input) => ({ id: 'endpoint-webhook', type: input.type, destination: input.destination, enabled: true })),
    })
    render(<AlertManager api={client} />)
    expect(await screen.findByRole('heading', { name: '登录后管理推送' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'creator@example.com')
    await user.type(screen.getByLabelText('密码'), 'correct-password')
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('heading', { name: '新建订阅' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '端点地址' }), 'https://hooks.example.com/creator')
    await user.type(screen.getByRole('textbox', { name: '密钥引用' }), 'env:AYA_CREATOR_WEBHOOK_SECRET')
    await user.click(screen.getByRole('button', { name: '保存端点' }))
    expect(client.createEndpoint).toHaveBeenCalledWith({ type: 'webhook', destination: 'https://hooks.example.com/creator', secretRef: 'env:AYA_CREATOR_WEBHOOK_SECRET' })
    expect(await screen.findByText(/密钥只引用服务端环境变量/)).toBeInTheDocument()
  })

  it('announces matching realtime events without resetting active filters', async () => {
    const listeners = new Map<string, (event: MessageEvent) => void>()
    const close = vi.fn()
    const streamFactory = vi.fn(() => ({ addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener as (event: MessageEvent) => void), close }))
    const client = api({ canStream: vi.fn(async () => true) })
    render(<CreatorDashboard api={client} streamFactory={streamFactory} />)
    await screen.findByRole('heading', { name: 'Agent 工具真实实测' })
    listeners.get('post.hot')?.({ data: JSON.stringify({ seq: 9, verticalId: 'ai-tech' }) } as MessageEvent)
    expect(await screen.findByText('收到 1 条 AI 科技实时更新')).toBeInTheDocument()
    expect(client.loadDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ vertical: 'ai-tech', window: '72h' }))
  })
})
