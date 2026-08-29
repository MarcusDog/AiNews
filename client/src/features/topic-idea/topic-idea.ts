export interface NewsArticle {
  id?: string
  title: string
  description?: string
  source?: string
  url: string
  publishedAt?: string
  opportunity?: CreatorOpportunityMetadata
}

export interface CreatorOpportunityMetadata {
  formulaVersion: string
  creatorScore: number
  trendScore: number
  evidenceStrength: string
  lens: string
  angle: string
  audience: string
  deliverable: string
  riskNotes: string[]
}

interface TopicIdeaBase {
  id: string
  label: '机会选题' | '来源选题' | '创作练习'
  title: string
  lens: string
  angle: string
  audience: string
  deliverable: string
  context?: string
  sourceUrl?: string
}

export interface SourceBackedIdea extends TopicIdeaBase {
  kind: 'source-backed'
  label: '机会选题' | '来源选题'
  source: string
  sourceUrl: string
  publishedAt?: string
  creatorScore?: number
  trendScore?: number
  evidenceStrength?: string
  formulaVersion?: string
  riskNotes?: string[]
}

export interface PracticeIdea extends TopicIdeaBase {
  kind: 'practice'
  label: '创作练习'
}

export type TopicIdea = SourceBackedIdea | PracticeIdea

type UnknownRecord = Record<string, unknown>

const CREATOR_LENSES = [
  {
    lens: '小白解释',
    angle: '不堆术语，只解释这件事发生了什么、影响谁，以及普通用户是否需要立刻行动。',
    audience: '刚开始关注 AI 的普通用户',
    deliverable: '完成一条 60–90 秒的口播稿，用一个具体生活或工作场景说明它的价值。',
  },
  {
    lens: '影响判断',
    angle: '把官方已确认的事实、可能带来的影响和仍需验证的问题分开来说。',
    audience: '想快速判断「这和我有没有关系」的读者',
    deliverable: '写一张「已确认 / 有影响 / 待验证」三段式内容卡片。',
  },
  {
    lens: '对比拆解',
    angle: '将这次变化与过去的做法对照，只比较可以从原始来源核对的部分。',
    audience: '已经在使用 AI 产品、关心变化成本的创作者',
    deliverable: '完成一份「以前 / 现在 / 值不值得试」的三段式图文提纲。',
  },
  {
    lens: '问题清单',
    angle: '从读者视角提出三个最需要被回答的问题，再回到原始来源逐一找答案。',
    audience: '想做实用型科普、避免只复述新闻的创作者',
    deliverable: '列出 3 个读者问题，并完成一个有原始链接的回答提纲。',
  },
] as const

const PRACTICE_IDEAS: PracticeIdea[] = [
  {
    id: 'practice-workflow',
    kind: 'practice',
    label: '创作练习',
    title: '挑一个你最近真正用过的 AI 功能，说清它替你省下了哪一步。',
    lens: '真实体验',
    angle: '不介绍功能大全，只展示一个你亲自完成过的工作流变化。',
    audience: '想知道 AI 能不能真正节省时间的普通用户',
    deliverable: '录制一条 60 秒的前后对比，并说出一个它仍然做不好的地方。',
  },
  {
    id: 'practice-regret',
    kind: 'practice',
    label: '创作练习',
    title: '复盘一个你曾经跟风、后来却放弃的 AI 工具。',
    lens: '反共识复盘',
    angle: '从「当时为什么想用」、「哪个环节开始放弃」、「谁反而适合它」三步展开。',
    audience: '正在被大量 AI 工具推荐淹没的读者',
    deliverable: '写一篇 500 字以内的真实复盘，给出一个明确的适用边界。',
  },
]

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isAllowedSourceUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname !== 'example.com' &&
      !url.hostname.endsWith('.example.com')
    )
  } catch {
    return false
  }
}

function normalizeArticle(value: unknown): NewsArticle | null {
  if (!isRecord(value)) return null

  const title = asOptionalString(value.title)
  if (!title || !isAllowedSourceUrl(value.url)) return null

  return {
    id: asOptionalString(value.id),
    title,
    description: asOptionalString(value.description),
    source: asOptionalString(value.source),
    url: value.url,
    publishedAt: asOptionalString(value.publishedAt),
  }
}

function stableIndex(value: string, length: number): number {
  const hash = Array.from(value).reduce((total, character) => (
    ((total * 31) + character.codePointAt(0)!) >>> 0
  ), 0)
  return hash % length
}

function clampRandom(randomValue: number): number {
  if (!Number.isFinite(randomValue)) return 0
  return Math.min(Math.max(randomValue, 0), 0.999999)
}

export function extractArticles(payload: unknown): NewsArticle[] {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return []
  if (!Array.isArray(payload.data.data)) return []

  return payload.data.data
    .map(normalizeArticle)
    .filter((article): article is NewsArticle => article !== null)
}

export function buildTopicIdea(article: NewsArticle): SourceBackedIdea {
  const lens = CREATOR_LENSES[stableIndex(article.id || article.url, CREATOR_LENSES.length)]
  const opportunity = article.opportunity
  let hostname = '原始来源'

  try {
    hostname = new URL(article.url).hostname.replace(/^www\./, '')
  } catch {
    // Articles are validated before reaching this point; keep a neutral label as a final fallback.
  }

  return {
    id: article.id || article.url,
    kind: 'source-backed',
    label: opportunity ? '机会选题' : '来源选题',
    title: article.title,
    lens: opportunity?.lens || lens.lens,
    angle: opportunity?.angle || lens.angle,
    audience: opportunity?.audience || lens.audience,
    deliverable: opportunity?.deliverable || lens.deliverable,
    context: article.description,
    source: article.source || hostname,
    sourceUrl: article.url,
    publishedAt: article.publishedAt,
    creatorScore: opportunity?.creatorScore,
    trendScore: opportunity?.trendScore,
    evidenceStrength: opportunity?.evidenceStrength,
    formulaVersion: opportunity?.formulaVersion,
    riskNotes: opportunity?.riskNotes,
  }
}

export function pickTopicIdea(
  articles: NewsArticle[],
  random: () => number = Math.random,
  excludeId?: string,
): TopicIdea {
  if (articles.length > 0) {
    const candidates = articles.length > 1 && excludeId
      ? articles.filter((article) => (article.id || article.url) !== excludeId)
      : articles
    const index = Math.floor(clampRandom(random()) * candidates.length)
    return buildTopicIdea(candidates[index])
  }

  const index = Math.floor(clampRandom(random()) * PRACTICE_IDEAS.length)
  return { ...PRACTICE_IDEAS[index] }
}
