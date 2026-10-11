import { describe, expect, it, vi } from 'vitest'
import { RadarApiError, fetchRadar } from './radar-api'

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const topic = {
  id: 'topic-1', canonical_topic_id: 'topic-1', title: 'Acme AI Tool', summary: 'Real evidence',
  firstSeenAt: '2026-08-27T00:00:00.000Z', latestSeenAt: '2026-08-27T02:00:00.000Z',
  trendScore: 72, creatorScore: 68, trendDirection: 'rising', evidenceStrength: 'cross-platform',
  formulaVersion: 'trend-v1', scoreBreakdown: { freshness: 25 },
  opportunity: { formulaVersion: 'opportunity-v1', angles: [], riskNotes: [] },
  clusterReasons: [], evidenceCount: 2,
}

describe('radar API', () => {
  it('loads a validated 24/48/72h workspace and drops unsafe evidence URLs', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/topics/topic-1')) return response({ success: true, data: {
        ...topic,
        signals: [
          { id: 'safe', sourceId: 'github', sourceName: 'GitHub', sourceTrustClass: 'official', platform: 'github', region: 'global', kind: 'repository', title: 'Acme', url: 'https://github.com/acme/tool', canonicalUrl: 'https://github.com/acme/tool', publishedAt: '2026-08-27T02:00:00.000Z', metrics: { stars: 42, forks: 3, replies: null }, tags: [], repoFullName: 'acme/tool' },
          { id: 'unsafe', sourceId: 'bad', sourceName: 'Bad', sourceTrustClass: 'bridge', platform: 'x', region: 'global', kind: 'post', title: 'Bad', url: 'javascript:alert(1)', publishedAt: '2026-08-27T02:00:00.000Z', metrics: {} },
        ],
      } })
      if (url.includes('/topics?')) return response({ success: true, data: { items: [topic] }, meta: { window: '48h' } })
      if (url.includes('/sources')) return response({ success: true, data: { items: [{ id: 'github', name: 'GitHub', tier: 'L1', platform: 'github', region: 'global', mode: 'api', trustClass: 'official', configured: true, enabled: true, schedulable: true, status: 'online', failureCount: 0, lastReceived: 2, lastSaved: 2 }] } })
      if (url.includes('/changes')) return response({ success: true, data: { items: [{ seq: 4, topicId: 'topic-1', changeType: 'new', changedAt: '2026-08-27T02:00:00.000Z', payload: {} }] }, meta: { next_cursor: 4 } })
      throw new Error(`unexpected ${url}`)
    })

    const result = await fetchRadar({ window: '48h', fetchImpl: fetchImpl as typeof fetch })
    expect(urls.some((url) => url.includes('window=48h'))).toBe(true)
    expect(urls).toContain('/api/signals/v1/topics/topic-1?window=48h')
    expect(result.topics[0].signals).toHaveLength(1)
    expect(result.topics[0].signals[0].url).toBe('https://github.com/acme/tool')
    expect(result.sources[0].status).toBe('online')
    expect(result.nextCursor).toBe(4)
  })

  it('rejects malformed envelopes and HTTP failures', async () => {
    await expect(fetchRadar({ fetchImpl: vi.fn(async () => response({ data: [] })) as typeof fetch }))
      .rejects.toMatchObject({ code: 'invalid_payload' })
    await expect(fetchRadar({ fetchImpl: vi.fn(async () => response({ success: false }, 503)) as typeof fetch }))
      .rejects.toMatchObject({ code: 'http_error', status: 503 })
  })

  it('preserves AbortError instead of converting it into a dashboard error', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetchImpl = vi.fn(async () => { throw abort })
    await expect(fetchRadar({ fetchImpl: fetchImpl as typeof fetch })).rejects.toBe(abort)
  })

  it('rejects unsupported windows before issuing requests', async () => {
    const fetchImpl = vi.fn()
    await expect(fetchRadar({ window: '7d' as '72h', fetchImpl: fetchImpl as typeof fetch }))
      .rejects.toBeInstanceOf(RadarApiError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
