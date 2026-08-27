import { describe, expect, it } from 'vitest'
import {
  buildTopicIdea,
  extractArticles,
  pickTopicIdea,
  type NewsArticle,
} from './topic-idea'

const articleA: NewsArticle = {
  id: 'news-1',
  title: 'Anthropic 发布全新 Claude 协作能力',
  description: '官方公告介绍了新的团队协作流程。',
  source: 'Anthropic',
  url: 'https://www.anthropic.com/news/collaboration',
  publishedAt: '2026-08-27T01:00:00.000Z',
}

const articleB: NewsArticle = {
  id: 'news-2',
  title: '一个开源 AI 视频工具公开新版本',
  description: '仓库提供了可运行的演示。',
  source: 'GitHub',
  url: 'https://github.com/example/real-project',
  publishedAt: '2026-08-27T02:00:00.000Z',
}

describe('extractArticles', () => {
  it('accepts the real nested latest-news response envelope', () => {
    const payload = {
      success: true,
      data: {
        data: [articleA],
        total: 1,
        page: 1,
        limit: 24,
      },
    }

    expect(extractArticles(payload)).toEqual([articleA])
  })

  it('returns no articles for failed or malformed envelopes', () => {
    expect(extractArticles({ success: false })).toEqual([])
    expect(extractArticles({ success: true, data: [] })).toEqual([])
    expect(extractArticles(null)).toEqual([])
  })

  it('filters empty titles, unsafe URLs, and explicit demo sources', () => {
    const payload = {
      success: true,
      data: {
        data: [
          articleA,
          { ...articleA, id: 'empty', title: '   ' },
          { ...articleA, id: 'script', url: 'javascript:alert(1)' },
          { ...articleA, id: 'demo', url: 'https://example.com/fake-news' },
        ],
      },
    }

    expect(extractArticles(payload)).toEqual([articleA])
  })
})

describe('buildTopicIdea', () => {
  it('keeps the source headline and evidence link without inventing metrics', () => {
    const idea = buildTopicIdea(articleA)

    expect(idea).toMatchObject({
      kind: 'source-backed',
      label: '来源选题',
      title: articleA.title,
      source: articleA.source,
      sourceUrl: articleA.url,
    })
    expect(idea.angle).not.toHaveLength(0)
    expect(idea.audience).not.toHaveLength(0)
    expect(idea.deliverable).not.toHaveLength(0)
    expect(JSON.stringify(idea)).not.toMatch(/热度\s*\d+|Creator Score|正在爆/)
  })

  it('uses the server Creator Opportunity angle and exposes real scores and risk notes', () => {
    const idea = buildTopicIdea({
      ...articleB,
      opportunity: {
        formulaVersion: 'opportunity-v1',
        creatorScore: 81,
        trendScore: 74,
        evidenceStrength: 'multi-source',
        lens: '创作者实测',
        angle: '从安装到限制完成一次可复现实测。',
        audience: 'AI 自媒体创作者',
        deliverable: '今天完成一条带原始证据的实测内容。',
        riskNotes: ['发布前核查版本。'],
      },
    })

    expect(idea).toMatchObject({
      kind: 'source-backed',
      label: '机会选题',
      lens: '创作者实测',
      angle: '从安装到限制完成一次可复现实测。',
      creatorScore: 81,
      trendScore: 74,
      riskNotes: ['发布前核查版本。'],
    })
  })
})

describe('pickTopicIdea', () => {
  it('uses injected randomness to choose among validated real articles', () => {
    expect(pickTopicIdea([articleA, articleB], () => 0).sourceUrl).toBe(articleA.url)
    expect(pickTopicIdea([articleA, articleB], () => 0.999).sourceUrl).toBe(articleB.url)
  })

  it('returns an honest practice assignment when no source is available', () => {
    const idea = pickTopicIdea([], () => 0)

    expect(idea).toMatchObject({
      kind: 'practice',
      label: '创作练习',
    })
    expect(idea.sourceUrl).toBeUndefined()
    expect(JSON.stringify(idea)).not.toMatch(/实时|正在爆|过去\s*48\s*小时/)
  })
})
