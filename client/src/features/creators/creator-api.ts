import type {
  CreatorAlertData, CreatorApiClient, CreatorDashboardData, CreatorDetail, CreatorPost,
  CreatorSource, CreatorSubscription, CreatorTopic, CreatorVertical, CursorPage,
  DeliveryEndpoint, CreatorWindow,
} from './creator-types'

export class CreatorApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'CreatorApiError'
    this.code = code
    this.status = status
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function items<T>(payload: unknown): T[] {
  return record(payload) && record(payload.data) && Array.isArray(payload.data.items)
    ? payload.data.items as T[] : []
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

function normalizePost(value: CreatorPost): CreatorPost | null {
  const url = safeUrl(value.url)
  if (!value?.id || !value.title || !url || !value.publishedAt) return null
  return { ...value, url }
}

function normalizeTopic(value: CreatorTopic): CreatorTopic | null {
  if (!value?.id || !value.title || !value.latestSeenAt) return null
  return {
    ...value,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.map((entry) => ({ ...entry, url: safeUrl(entry.url) })).filter((entry): entry is { postId?: string | null; url: string } => Boolean(entry.url))
      : [],
  }
}

function cursorPage<T>(payload: unknown, normalize: (value: T) => T | null): CursorPage<T> {
  const data = record(payload) && record(payload.data) ? payload.data : {}
  const raw = Array.isArray(data.items) ? data.items as T[] : []
  return {
    items: raw.map(normalize).filter((value): value is T => value !== null),
    nextCursor: typeof data.next_cursor === 'string' ? data.next_cursor : null,
  }
}

function windowSince(window: CreatorWindow, now: Date) {
  const hours = window === '24h' ? 24 : window === '48h' ? 48 : 72
  return new Date(now.getTime() - hours * 3_600_000).toISOString()
}

export function createCreatorApi(options: { fetchImpl?: typeof fetch; now?: () => Date } = {}): CreatorApiClient {
  const fetchImpl = options.fetchImpl || fetch
  const now = options.now || (() => new Date())

  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response
    try {
      response = await fetchImpl(url, {
        ...init,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(init.headers || {}) },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new CreatorApiError('network_error', '无法连接创作者情报接口')
    }
    let payload: unknown
    try { payload = await response.json() }
    catch { throw new CreatorApiError('invalid_response', '创作者情报接口返回了无法读取的内容', response.status) }
    if (!response.ok || !record(payload) || payload.success !== true) {
      const code = record(payload) && typeof payload.error === 'string'
        ? payload.error : response.status === 401 ? 'auth_required' : 'http_error'
      throw new CreatorApiError(code, code, response.status)
    }
    return payload
  }

  const loadPosts: CreatorApiClient['loadPosts'] = async ({ vertical, window, cursor, creator, signal }) => {
    const params = new URLSearchParams({ hot: 'true', limit: '12', since: windowSince(window, now()) })
    if (vertical && vertical !== 'all') params.set('vertical', vertical)
    if (creator) params.set('creator', creator)
    if (cursor) params.set('cursor', cursor)
    return cursorPage<CreatorPost>(await request(`/api/creators/v1/posts?${params}`, { signal }), normalizePost)
  }

  const loadTopics: CreatorApiClient['loadTopics'] = async ({ vertical, window, cursor, signal }) => {
    const params = new URLSearchParams({ window, limit: '12' })
    if (vertical && vertical !== 'all') params.set('vertical', vertical)
    if (cursor) params.set('cursor', cursor)
    return cursorPage<CreatorTopic>(await request(`/api/creators/v1/topics?${params}`, { signal }), normalizeTopic)
  }

  return {
    async loadDashboard({ vertical, window, signal }): Promise<CreatorDashboardData> {
      const creatorParams = new URLSearchParams({ status: 'verified', limit: '12' })
      if (vertical && vertical !== 'all') creatorParams.set('vertical', vertical)
      const [verticalPayload, creatorPayload, posts, topics] = await Promise.all([
        request('/api/creators/v1/verticals', { signal }),
        request(`/api/creators/v1/creators?${creatorParams}`, { signal }),
        loadPosts({ vertical, window, signal }),
        loadTopics({ vertical, window, signal }),
      ])
      return {
        verticals: items<CreatorVertical>(verticalPayload),
        creators: cursorPage(creatorPayload, (value) => value),
        posts,
        topics,
      }
    },
    loadPosts,
    loadTopics,
    async loadCreator(id, signal) {
      const payload = await request(`/api/creators/v1/creators/${encodeURIComponent(id)}`, { signal })
      if (!record(payload.data)) throw new CreatorApiError('invalid_payload', '创作者详情结构不正确')
      return payload.data as unknown as CreatorDetail
    },
    async loadCreatorPosts(id, cursor, signal) {
      const params = new URLSearchParams({ limit: '12' })
      if (cursor) params.set('cursor', cursor)
      return cursorPage<CreatorPost>(await request(`/api/creators/v1/creators/${encodeURIComponent(id)}/posts?${params}`, { signal }), normalizePost)
    },
    async loadSources(signal) {
      return items<CreatorSource>(await request('/api/creators/v1/sources', { signal }))
    },
    async loadAlerts(signal): Promise<CreatorAlertData> {
      const session = await request('/api/auth/session', { signal })
      const sessionData = record(session.data) ? session.data : null
      const user = sessionData && sessionData.authenticated === true && record(sessionData.user)
        ? sessionData.user : null
      if (!user || typeof user.id !== 'string') throw new CreatorApiError('auth_required', 'auth_required', 401)
      const [endpoints, subscriptions, deliveries] = await Promise.all([
        request('/api/creators/v1/delivery-endpoints', { signal }),
        request('/api/creators/v1/subscriptions', { signal }),
        request('/api/creators/v1/deliveries?limit=50', { signal }),
      ])
      return {
        user: { id: user.id },
        endpoints: items<DeliveryEndpoint>(endpoints),
        subscriptions: items<CreatorSubscription>(subscriptions),
        deliveries: items(deliveries),
      }
    },
    async createEndpoint(input) {
      const payload = await request('/api/creators/v1/delivery-endpoints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      })
      return payload.data as DeliveryEndpoint
    },
    async createSubscription(input) {
      const payload = await request('/api/creators/v1/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name, deliveryMode: 'immediate', endpointIds: input.endpointIds,
          filters: { verticals: [input.vertical], minimumScore: input.minimumScore },
          quietHours: { enabled: false },
        }),
      })
      return payload.data as CreatorSubscription
    },
    async testEndpoint(id) {
      const payload = await request(`/api/creators/v1/delivery-endpoints/${encodeURIComponent(id)}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      return payload.data as { status: string }
    },
    async canStream() {
      try {
        const payload = await request('/api/auth/session')
        return record(payload.data) && payload.data.authenticated === true
      } catch { return false }
    },
    async login(input) {
      await request('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      })
    },
    async register(input) {
      await request('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      })
    },
  }
}
