import { describe, expect, it, vi } from 'vitest'
import { createCreatorApi, CreatorApiError } from './creator-api'

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

describe('Creator Intelligence API', () => {
  it('loads a vertical/window dashboard from real Creator routes and preserves opaque cursors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/verticals')) return response({ success: true, data: { items: [{ id: 'beauty', name: '美妆', creatorCount: 2, postCount: 9 }] } })
      if (url.includes('/creators?')) return response({ success: true, data: { items: [{ id: 'creator-a', displayName: 'A', verticalIds: ['beauty'], accountCount: 1 }], next_cursor: null } })
      if (url.includes('/posts?')) return response({ success: true, data: { items: [{ id: 'post-a', creatorId: 'creator-a', creatorName: 'A', platform: 'youtube', url: 'https://youtube.com/watch?v=a', title: '爆款', publishedAt: '2026-08-29T11:00:00.000Z', verticalIds: ['beauty'], hotness: { formulaVersion: 'creator-hotness-v1', score: 88, confidence: 'high', components: { velocity: 30 }, penalties: {} } }], next_cursor: 'opaque-post-cursor' } })
      return response({ success: true, data: { items: [{ id: 'topic-a', verticalId: 'beauty', title: '共题', latestSeenAt: '2026-08-29T11:00:00.000Z', hotness: 91, formulaVersion: 'creator-topic-v1', creatorCount: 3, platformCount: 2, evidence: [] }], next_cursor: 'opaque-topic-cursor' } })
    })
    const api = createCreatorApi({ fetchImpl, now: () => new Date('2026-08-29T12:00:00.000Z') })
    const result = await api.loadDashboard({ vertical: 'beauty', window: '24h' })
    expect(result.posts.nextCursor).toBe('opaque-post-cursor')
    expect(result.topics.nextCursor).toBe('opaque-topic-cursor')
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
      '/api/creators/v1/verticals',
      expect.stringContaining('vertical=beauty'),
      expect.stringContaining('since=2026-08-28T12%3A00%3A00.000Z'),
      expect.stringContaining('window=24h'),
    ]))
  })

  it('filters unsafe evidence URLs and reports precise authenticated API failures', async () => {
    const topicApi = createCreatorApi({ fetchImpl: vi.fn(async () => response({ success: true, data: { items: [{ id: 'topic-a', title: '安全证据', latestSeenAt: '2026-08-29T11:00:00.000Z', formulaVersion: 'creator-topic-v1', creatorCount: 1, platformCount: 1, evidence: [{ url: 'javascript:alert(1)' }, { url: 'https://example.com/evidence' }] }] } })) })
    const topics = await topicApi.loadTopics({ vertical: 'ai-tech', window: '24h' })
    expect(topics.items[0].evidence).toEqual([{ url: 'https://example.com/evidence' }])

    const authApi = createCreatorApi({ fetchImpl: vi.fn(async () => response({ success: false, error: 'auth_required' }, 401)) })
    await expect(authApi.loadAlerts()).rejects.toMatchObject({ code: 'auth_required', status: 401 } satisfies Partial<CreatorApiError>)
  })

  it('does not fan out protected alert requests for an anonymous session', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ success: true, data: { authenticated: false } }))
    const api = createCreatorApi({ fetchImpl })
    await expect(api.loadAlerts()).rejects.toMatchObject({ code: 'auth_required', status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('creates subscriptions with same-origin credentials and exact endpoint ownership payload', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ success: true, data: { id: 'subscription-a' } }))
    const api = createCreatorApi({ fetchImpl })
    await api.createSubscription({ name: 'AI 爆款', endpointIds: ['endpoint-a'], vertical: 'ai-tech', minimumScore: 75 })
    expect(fetchImpl).toHaveBeenCalledWith('/api/creators/v1/subscriptions', expect.objectContaining({
      method: 'POST', credentials: 'same-origin',
      body: JSON.stringify({
        name: 'AI 爆款', deliveryMode: 'immediate', endpointIds: ['endpoint-a'],
        filters: { verticals: ['ai-tech'], minimumScore: 75 }, quietHours: { enabled: false },
      }),
    }))
  })

  it('authenticates in place with JSON and same-origin cookies', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ success: true, data: { user: { id: 'user-a' } } }))
    const api = createCreatorApi({ fetchImpl })
    await api.login({ email: 'creator@example.com', password: 'correct-password' })
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'same-origin',
      headers: expect.objectContaining({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    }))
  })

  it('checks realtime eligibility through the quiet session probe', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response({ success: true, data: { authenticated: false } }))
    const api = createCreatorApi({ fetchImpl })
    await expect(api.canStream()).resolves.toBe(false)
    expect(fetchImpl).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ credentials: 'same-origin' }))
  })
})
