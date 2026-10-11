import type {
  RadarChange,
  RadarData,
  RadarSignal,
  RadarSource,
  RadarTopic,
  RadarWindow,
  SourceStatus,
} from './radar-types'

type RadarErrorCode = 'network_error' | 'http_error' | 'invalid_response' | 'invalid_payload' | 'invalid_window'

export class RadarApiError extends Error {
  readonly code: RadarErrorCode
  readonly status?: number

  constructor(code: RadarErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'RadarApiError'
    this.code = code
    this.status = status
  }
}

interface FetchRadarOptions {
  window?: RadarWindow
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

async function jsonRequest(fetchImpl: typeof fetch, endpoint: string, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' }, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new RadarApiError('network_error', '无法连接视野监测接口')
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new RadarApiError('invalid_response', '视野监测接口返回了无法读取的内容', response.status)
  }
  if (!response.ok) throw new RadarApiError('http_error', `视野监测接口暂时不可用（${response.status}）`, response.status)
  if (!record(payload) || payload.success !== true) throw new RadarApiError('invalid_payload', '视野监测数据结构不正确')
  return payload
}

function normalizeSignal(value: unknown): RadarSignal | null {
  if (!record(value)) return null
  const id = text(value.id)
  const title = text(value.title)
  const url = safeUrl(value.url)
  const publishedAt = text(value.publishedAt)
  const sourceId = text(value.sourceId)
  const platform = text(value.platform)
  if (!id || !title || !url || !publishedAt || !sourceId || !platform) return null
  const rawMetrics = record(value.metrics) ? value.metrics : {}
  const metrics: Record<string, number | null> = {}
  for (const [key, metric] of Object.entries(rawMetrics)) {
    if (metric === null || (typeof metric === 'number' && Number.isFinite(metric))) {
      metrics[key] = metric
    }
  }
  return {
    id,
    sourceId,
    sourceName: text(value.sourceName) || sourceId,
    sourceTrustClass: text(value.sourceTrustClass) || 'public_feed',
    platform,
    region: value.region === 'cn' ? 'cn' : 'global',
    kind: text(value.kind) || 'post',
    title,
    summary: text(value.summary),
    url,
    canonicalUrl: safeUrl(value.canonicalUrl) || url,
    author: text(value.author),
    publishedAt,
    metrics,
    tags: Array.isArray(value.tags) ? value.tags.map(text).filter((item): item is string => Boolean(item)) : [],
    repoFullName: text(value.repoFullName),
  }
}

function normalizeTopic(value: unknown): RadarTopic | null {
  if (!record(value)) return null
  const id = text(value.id)
  const title = text(value.title)
  const trendScore = number(value.trendScore)
  const creatorScore = number(value.creatorScore)
  const firstSeenAt = text(value.firstSeenAt)
  const latestSeenAt = text(value.latestSeenAt)
  if (!id || !title || trendScore === null || creatorScore === null || !firstSeenAt || !latestSeenAt) return null
  const opportunity = record(value.opportunity) ? value.opportunity : {}
  const angles = Array.isArray(opportunity.angles) ? opportunity.angles.filter(record).map((angle) => ({
    audience: text(angle.audience) || 'creator',
    title: text(angle.title) || title,
    angle: text(angle.angle) || '',
  })) : []
  return {
    id,
    canonicalTopicId: text(value.canonical_topic_id) || id,
    title,
    summary: text(value.summary),
    firstSeenAt,
    latestSeenAt,
    trendScore,
    creatorScore,
    trendDirection: text(value.trendDirection) || 'steady',
    evidenceStrength: text(value.evidenceStrength) || 'single-source',
    formulaVersion: text(value.formulaVersion) || 'trend-v1',
    scoreBreakdown: record(value.scoreBreakdown) ? value.scoreBreakdown : {},
    opportunity: {
      ...opportunity,
      formulaVersion: text(opportunity.formulaVersion) || 'opportunity-v1',
      angles,
      riskNotes: Array.isArray(opportunity.riskNotes) ? opportunity.riskNotes.map(text).filter((item): item is string => Boolean(item)) : [],
    },
    clusterReasons: Array.isArray(value.clusterReasons) ? value.clusterReasons.map(text).filter((item): item is string => Boolean(item)) : [],
    evidenceCount: number(value.evidenceCount) || 0,
    signals: Array.isArray(value.signals) ? value.signals.map(normalizeSignal).filter((item): item is RadarSignal => item !== null) : [],
  }
}

function normalizeSource(value: unknown): RadarSource | null {
  if (!record(value)) return null
  const id = text(value.id)
  const name = text(value.name)
  const allowed = new Set<SourceStatus>(['online', 'degraded', 'offline', 'unconfigured', 'disabled', 'pending'])
  const status = text(value.status) as SourceStatus | null
  if (!id || !name || !status || !allowed.has(status)) return null
  return {
    id, name,
    tier: text(value.tier) || 'L1', platform: text(value.platform) || 'unknown',
    region: value.region === 'cn' ? 'cn' : 'global', mode: text(value.mode) || 'api',
    trustClass: text(value.trustClass) || 'public_feed', configured: value.configured === true,
    enabled: value.enabled === true, schedulable: value.schedulable === true, status,
    setupHint: text(value.setupHint), lastAttemptAt: text(value.lastAttemptAt), lastSuccessAt: text(value.lastSuccessAt),
    failureCount: number(value.failureCount) || 0, lastReceived: number(value.lastReceived) || 0, lastSaved: number(value.lastSaved) || 0,
  }
}

function normalizeChange(value: unknown): RadarChange | null {
  if (!record(value)) return null
  const seq = number(value.seq)
  const topicId = text(value.topicId)
  const changedAt = text(value.changedAt)
  if (seq === null || !topicId || !changedAt) return null
  return { seq, topicId, changeType: text(value.changeType) || 'updated', changedAt, payload: record(value.payload) ? value.payload : {} }
}

export async function fetchRadar({ window = '72h', signal, fetchImpl = fetch }: FetchRadarOptions = {}): Promise<RadarData> {
  if (!['24h', '48h', '72h'].includes(window)) throw new RadarApiError('invalid_window', '仅支持 24h、48h、72h')
  const [topicsPayload, sourcesPayload, changesPayload] = await Promise.all([
    jsonRequest(fetchImpl, `/api/signals/v1/topics?window=${window}&limit=30`, signal),
    jsonRequest(fetchImpl, '/api/signals/v1/sources', signal),
    jsonRequest(fetchImpl, '/api/signals/v1/changes?since=0&limit=30', signal),
  ])
  const topicItems = record(topicsPayload.data) && Array.isArray(topicsPayload.data.items) ? topicsPayload.data.items : null
  const sourceItems = record(sourcesPayload.data) && Array.isArray(sourcesPayload.data.items) ? sourcesPayload.data.items : null
  const changeItems = record(changesPayload.data) && Array.isArray(changesPayload.data.items) ? changesPayload.data.items : null
  if (!topicItems || !sourceItems || !changeItems) throw new RadarApiError('invalid_payload', '视野监测列表结构不正确')
  const baseTopics = topicItems.map(normalizeTopic).filter((item): item is RadarTopic => item !== null)
  const detailed = await Promise.all(baseTopics.slice(0, 12).map(async (topic) => {
    try {
      const payload = await jsonRequest(fetchImpl, `/api/signals/v1/topics/${encodeURIComponent(topic.id)}?window=${window}`, signal)
      return normalizeTopic(payload.data) || topic
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      return topic
    }
  }))
  return {
    window,
    topics: [...detailed, ...baseTopics.slice(12)],
    sources: sourceItems.map(normalizeSource).filter((item): item is RadarSource => item !== null),
    changes: changeItems.map(normalizeChange).filter((item): item is RadarChange => item !== null),
    nextCursor: record(changesPayload.meta) && number(changesPayload.meta.next_cursor) !== null ? number(changesPayload.meta.next_cursor)! : 0,
  }
}
