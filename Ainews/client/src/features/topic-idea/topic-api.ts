import { extractArticles, type NewsArticle } from './topic-idea'
import type { CreatorProfile, TopicWindow } from './use-topic-idea'

type TopicSourceErrorCode =
  | 'network_error'
  | 'http_error'
  | 'invalid_response'
  | 'invalid_payload'

interface FetchLatestArticlesOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  profile?: CreatorProfile
  window?: TopicWindow
}

interface JsonResult {
  response: Response
  payload: unknown
}

export class TopicSourceError extends Error {
  readonly code: TopicSourceErrorCode
  readonly status?: number

  constructor(code: TopicSourceErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'TopicSourceError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function hasLatestNewsEnvelope(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    payload.success === true &&
    isRecord(payload.data) &&
    Array.isArray(payload.data.data)
  )
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return undefined
    if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

async function requestJson(
  endpoint: string,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<JsonResult> {
  let response: Response
  try {
    response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' }, signal })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TopicSourceError('network_error', '无法连接站内来源')
  }
  if (!response.ok) {
    throw new TopicSourceError('http_error', `站内来源暂时不可用（${response.status}）`, response.status)
  }
  try {
    return { response, payload: await response.json() }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TopicSourceError('invalid_response', '站内来源返回了无法读取的内容', response.status)
  }
}

function opportunityArticle(value: unknown): NewsArticle | null {
  if (!isRecord(value)) return null
  const data = value
  const topicId = optionalString(data.id)
  const opportunity = isRecord(data.opportunity) ? data.opportunity : null
  const angles = opportunity && Array.isArray(opportunity.angles) ? opportunity.angles.filter(isRecord) : []
  const selectedAngle = angles.find((angle) => angle.audience === 'creator') || angles[0]
  const signals = Array.isArray(data.signals) ? data.signals.filter(isRecord) : []
  const evidence = signals.find((signal) => safeUrl(signal.url))
  const creatorScore = finiteNumber(data.creatorScore)
  const trendScore = finiteNumber(data.trendScore)
  if (!topicId || !selectedAngle || !evidence || creatorScore === undefined || trendScore === undefined || !opportunity) return null
  const url = safeUrl(evidence.url)
  const title = optionalString(selectedAngle.title) || optionalString(data.title)
  const angle = optionalString(selectedAngle.angle)
  if (!url || !title || !angle) return null
  const riskNotes = Array.isArray(opportunity.riskNotes)
    ? opportunity.riskNotes.map(optionalString).filter((item): item is string => Boolean(item))
    : []
  return {
    id: topicId,
    title,
    description: optionalString(data.summary),
    source: optionalString(evidence.sourceName) || optionalString(evidence.sourceId) || '原始证据',
    url,
    publishedAt: optionalString(evidence.publishedAt) || optionalString(data.latestSeenAt),
    opportunity: {
      formulaVersion: optionalString(opportunity.formulaVersion) || 'opportunity-v1',
      creatorScore,
      trendScore,
      evidenceStrength: optionalString(data.evidenceStrength) || 'unknown',
      lens: selectedAngle.audience === 'creator' ? '创作者实测' : '热点解释',
      angle,
      audience: selectedAngle.audience === 'creator' ? 'AI 自媒体与内容创作者' : '关注 AI 的普通读者',
      deliverable: selectedAngle.audience === 'creator'
        ? '今天完成一条带原始链接、复现过程和限制说明的内容。'
        : '今天完成一条区分事实、影响与待验证问题的内容。',
      riskNotes,
    },
  }
}

async function fetchCreatorOpportunities(
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
  profile: CreatorProfile,
  window: TopicWindow,
): Promise<NewsArticle[]> {
  const endpoint = `/api/news/discover?window=${window}&profile=${profile}&limit=24`
  const { payload } = await requestJson(endpoint, signal, fetchImpl)
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data) || !Array.isArray(payload.data.items)) {
    throw new TopicSourceError('invalid_payload', 'Creator Opportunity 数据结构不正确')
  }
  const articles = payload.data.items.map(opportunityArticle).filter((item): item is NewsArticle => item !== null)
  if (!articles.length && payload.data.items.length) {
    throw new TopicSourceError('invalid_payload', 'Creator Opportunity 缺少可回查的原始证据')
  }
  return articles
}

async function fetchCompatibleNews(signal: AbortSignal | undefined, fetchImpl: typeof fetch): Promise<NewsArticle[]> {
  const { payload } = await requestJson('/api/news/latest?page=1&limit=24', signal, fetchImpl)
  if (!hasLatestNewsEnvelope(payload)) throw new TopicSourceError('invalid_payload', '站内来源数据结构不正确')
  return extractArticles(payload)
}

export async function fetchLatestArticles({
  signal,
  fetchImpl = fetch,
  profile = 'general',
  window = '72h',
}: FetchLatestArticlesOptions = {}): Promise<NewsArticle[]> {
  try {
    return await fetchCreatorOpportunities(signal, fetchImpl, profile, window)
  } catch (error) {
    if (isAbortError(error)) throw error
  }
  return fetchCompatibleNews(signal, fetchImpl)
}
