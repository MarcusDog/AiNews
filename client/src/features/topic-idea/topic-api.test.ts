import { describe, expect, it, vi } from 'vitest'
import { fetchLatestArticles, TopicSourceError } from './topic-api'

const article = {
  id: 'real-1',
  title: '官方发布一项 AI 产品更新',
  source: '官方博客',
  url: 'https://official.example.org/news/update',
  publishedAt: '2026-08-27T02:00:00.000Z',
}

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('fetchLatestArticles', () => {
  it('loads multiple creator opportunities with original evidence for non-repeating rerolls', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ success: true, data: { items: [{
      id: 'topic-1', title: '真实 AI 项目', summary: '多源摘要', trendScore: 74,
      creatorScore: 81, evidenceStrength: 'multi-source', latestSeenAt: article.publishedAt,
      opportunity: { formulaVersion: 'opportunity-v2', profile: 'tool-review', angles: [{ audience: 'creator', title: 'AI 工具实测｜真实 AI 项目', angle: '完成可复现演示。' }], riskNotes: ['发布前核查版本。'] },
      signals: [{ id: 'signal-1', sourceName: 'GitHub', url: article.url, publishedAt: article.publishedAt }],
    }, {
      id: 'topic-2', title: '第二个热点', trendScore: 70, creatorScore: 76, evidenceStrength: 'single-source',
      opportunity: { formulaVersion: 'opportunity-v2', profile: 'tool-review', angles: [{ audience: 'creator', title: 'AI 工具实测｜第二个热点', angle: '验证真实效果。' }], riskNotes: [] },
      signals: [{ id: 'signal-2', sourceName: 'Reddit', url: 'https://reddit.example/topic-2', publishedAt: article.publishedAt }],
    }] } }))

    await expect(fetchLatestArticles({ signal: controller.signal, fetchImpl, profile: 'tool-review' })).resolves.toEqual([
      expect.objectContaining({
        id: 'topic-1', title: 'AI 工具实测｜真实 AI 项目', source: 'GitHub', url: article.url,
        opportunity: expect.objectContaining({ creatorScore: 81, trendScore: 74, formulaVersion: 'opportunity-v2' }),
      }),
      expect.objectContaining({ id: 'topic-2', source: 'Reddit' }),
    ])
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/news/discover?window=72h&profile=tool-review&limit=24',
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('falls back to the compatible real news API when no opportunity exists', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ success: false, error: 'no_opportunity_available' }, false, 404))
      .mockResolvedValueOnce(response({ success: true, data: { data: [article], total: 1, page: 1, limit: 24 } }))

    await expect(fetchLatestArticles({ fetchImpl })).resolves.toEqual([article])
    expect(fetchImpl).toHaveBeenLastCalledWith('/api/news/latest?page=1&limit=24', expect.any(Object))
  })

  it('accepts a truthful empty response after the opportunity fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({}, false, 404))
      .mockResolvedValueOnce(response({ success: true, data: { data: [], total: 0, page: 1, limit: 24 } }))

    await expect(fetchLatestArticles({ fetchImpl })).resolves.toEqual([])
  })

  it('rejects when both opportunity and compatible news sources are unavailable', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce(response({}, false, 503))

    await expect(fetchLatestArticles({ fetchImpl })).rejects.toMatchObject({
      name: 'TopicSourceError',
      code: 'http_error',
      status: 503,
    })
  })

  it('rejects failed and malformed API envelopes', async () => {
    const failedFetch = vi.fn()
      .mockResolvedValueOnce(response({ success: false }, false, 503))
      .mockResolvedValueOnce(response({ success: false }))
    const malformedFetch = vi.fn()
      .mockResolvedValueOnce(response({ success: false }, false, 503))
      .mockResolvedValueOnce(response({ success: true, data: { data: 'bad' } }))

    await expect(fetchLatestArticles({ fetchImpl: failedFetch })).rejects.toBeInstanceOf(TopicSourceError)
    await expect(fetchLatestArticles({ fetchImpl: malformedFetch })).rejects.toMatchObject({
      code: 'invalid_payload',
    })
  })

  it('maps unreadable JSON to an invalid-response error', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({}, false, 503))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
      } as unknown as Response)

    await expect(fetchLatestArticles({ fetchImpl })).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('does not hide AbortError from the caller', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const fetchImpl = vi.fn().mockRejectedValue(abortError)

    await expect(fetchLatestArticles({ fetchImpl })).rejects.toBe(abortError)
  })
})
