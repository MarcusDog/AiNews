export type RadarWindow = '24h' | '48h' | '72h'
export type SourceStatus = 'online' | 'degraded' | 'offline' | 'unconfigured' | 'disabled' | 'pending'

export interface RadarSignal {
  id: string
  sourceId: string
  sourceName: string
  sourceTrustClass: string
  platform: string
  region: 'cn' | 'global'
  kind: string
  title: string
  summary?: string | null
  url: string
  canonicalUrl?: string
  author?: string | null
  publishedAt: string
  metrics: Record<string, number | null>
  tags: string[]
  repoFullName?: string | null
}

export interface RadarAngle {
  audience: 'beginner' | 'general' | 'creator' | string
  title: string
  angle: string
}

export interface RadarTopic {
  id: string
  canonicalTopicId: string
  title: string
  summary?: string | null
  firstSeenAt: string
  latestSeenAt: string
  trendScore: number
  creatorScore: number
  trendDirection: string
  evidenceStrength: string
  formulaVersion: string
  scoreBreakdown: Record<string, unknown>
  opportunity: {
    formulaVersion: string
    angles: RadarAngle[]
    riskNotes: string[]
    [key: string]: unknown
  }
  clusterReasons: string[]
  evidenceCount: number
  signals: RadarSignal[]
}

export interface RadarSource {
  id: string
  name: string
  tier: string
  platform: string
  region: 'cn' | 'global'
  mode: string
  trustClass: string
  configured: boolean
  enabled: boolean
  schedulable: boolean
  status: SourceStatus
  setupHint?: string | null
  lastAttemptAt?: string | null
  lastSuccessAt?: string | null
  failureCount: number
  lastReceived: number
  lastSaved: number
}

export interface RadarChange {
  seq: number
  topicId: string
  changeType: string
  changedAt: string
  payload: Record<string, unknown>
}

export interface RadarData {
  window: RadarWindow
  topics: RadarTopic[]
  sources: RadarSource[]
  changes: RadarChange[]
  nextCursor: number
}

export interface RadarLoadOptions {
  window: RadarWindow
  signal?: AbortSignal
}

export type RadarLoader = (options: RadarLoadOptions) => Promise<RadarData>
