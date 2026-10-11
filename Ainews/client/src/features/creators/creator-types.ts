export type CreatorWindow = '24h' | '48h' | '72h'
export type CreatorTab = 'posts' | 'topics'

export interface CreatorVertical {
  id: string
  name: string
  creatorCount: number
  postCount: number
}

export interface CreatorSummary {
  id: string
  displayName: string
  kind: string
  reviewStatus: string
  reviewedAt?: string | null
  verticalIds: string[]
  accountCount: number
  latestPostAt?: string | null
}

export interface CreatorAccount {
  id: string
  platform: string
  handle?: string | null
  profileUrl: string
  region?: string
  sourceTier?: string
  enabled: boolean
  authState: string
  lastVerifiedAt?: string | null
  latestPostAt?: string | null
  postCount: number
  backfill: {
    state: string
    oldestFetchedAt?: string | null
    newestFetchedAt?: string | null
    lastReconciledAt?: string | null
    historyLimitReason?: string | null
    pagesFetched: number
    itemsFetched: number
    updatedAt?: string | null
  }
}

export interface CreatorDetail extends CreatorSummary {
  accounts: CreatorAccount[]
}

export interface CreatorHotness {
  formulaVersion: string
  score: number
  confidence: string
  components: Record<string, number | null>
  penalties: Record<string, number | null>
}

export interface CreatorPost {
  id: string
  creatorId: string
  creatorName: string
  platform: string
  url: string
  title: string
  text?: string | null
  publishedAt: string
  verticalIds: string[]
  hotness?: CreatorHotness | null
}

export interface CreatorTopic {
  id: string
  verticalId?: string | null
  title: string
  summary?: string | null
  firstSeenAt?: string
  latestSeenAt: string
  hotness?: number | null
  formulaVersion: string
  creatorCount: number
  platformCount: number
  evidence: Array<{ postId?: string | null; url: string }>
}

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface CreatorDashboardData {
  verticals: CreatorVertical[]
  creators: CursorPage<CreatorSummary>
  posts: CursorPage<CreatorPost>
  topics: CursorPage<CreatorTopic>
}

export interface CreatorSource {
  id: string
  platform: string
  tier: string
  configured: boolean
  schedulable: boolean
  status: string
  lastSuccessAt?: string | null
  lastAttemptAt?: string | null
  lastFailureCode?: string | null
  setupHint?: string | null
  accountCount: number
  enabledAccountCount: number
  postCount: number
  latestPostAt?: string | null
}

export interface DeliveryEndpoint {
  id: string
  type: string
  destination: string
  enabled: boolean
}

export interface CreatorSubscription {
  id: string
  name?: string
  endpointIds?: string[]
  enabled?: boolean
  filters?: { verticals?: string[]; minimumScore?: number | null }
}

export interface CreatorDelivery {
  id: string
  endpointId: string
  status: string
  attemptCount: number
  eventType: string
  createdAt: string
  deliveredAt?: string | null
  latestAttempt?: {
    attemptedAt: string
    status: string
    responseCode?: number | null
    error?: string | null
  } | null
}

export interface CreatorAlertData {
  user: { id: string }
  endpoints: DeliveryEndpoint[]
  subscriptions: CreatorSubscription[]
  deliveries: CreatorDelivery[]
}

export interface CreatorApiClient {
  loadDashboard(options: { vertical: string; window: CreatorWindow; signal?: AbortSignal }): Promise<CreatorDashboardData>
  loadPosts(options: { vertical: string; window: CreatorWindow; cursor?: string | null; creator?: string; signal?: AbortSignal }): Promise<CursorPage<CreatorPost>>
  loadTopics(options: { vertical: string; window: CreatorWindow; cursor?: string | null; signal?: AbortSignal }): Promise<CursorPage<CreatorTopic>>
  loadCreator(id: string, signal?: AbortSignal): Promise<CreatorDetail>
  loadCreatorPosts(id: string, cursor?: string | null, signal?: AbortSignal): Promise<CursorPage<CreatorPost>>
  loadSources(signal?: AbortSignal): Promise<CreatorSource[]>
  loadAlerts(signal?: AbortSignal): Promise<CreatorAlertData>
  createEndpoint(input: { type: string; destination: string; secretRef?: string }): Promise<DeliveryEndpoint>
  createSubscription(input: { name: string; endpointIds: string[]; vertical: string; minimumScore: number }): Promise<CreatorSubscription>
  testEndpoint(id: string): Promise<{ status: string }>
  canStream(): Promise<boolean>
  login(input: { email: string; password: string }): Promise<void>
  register(input: { email: string; password: string; displayName: string }): Promise<void>
}

export interface CreatorStream {
  addEventListener(type: string, listener: EventListener): void
  close(): void
}

export type CreatorStreamFactory = (url: string) => CreatorStream
