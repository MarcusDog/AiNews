import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RadarDashboard } from './radar-dashboard'
import type { RadarData, RadarLoader } from './radar-types'

const data: RadarData = {
  window: '72h', nextCursor: 4,
  topics: [{
    id: 'topic-1', canonicalTopicId: 'topic-1', title: 'Acme AI Tool', summary: '真实项目证据',
    firstSeenAt: '2026-08-27T00:00:00.000Z', latestSeenAt: '2026-08-27T02:00:00.000Z',
    trendScore: 72, creatorScore: 68, trendDirection: 'rising', evidenceStrength: 'single-source',
    formulaVersion: 'trend-v1', scoreBreakdown: { freshness: 25, diversity: 5 }, evidenceCount: 1,
    opportunity: { formulaVersion: 'opportunity-v1', angles: [{ audience: 'creator', title: '实测 Acme AI Tool', angle: '复现安装' }], riskNotes: ['当前只有单一来源证据'] },
    clusterReasons: [],
    signals: [{ id: 'signal-1', sourceId: 'github', sourceName: 'GitHub', sourceTrustClass: 'official', platform: 'github', region: 'global', kind: 'repository', title: 'Acme AI Tool', url: 'https://github.com/acme/tool', canonicalUrl: 'https://github.com/acme/tool', publishedAt: '2026-08-27T02:00:00.000Z', metrics: { stars: 42, forks: 3, replies: null }, tags: [], repoFullName: 'acme/tool' }],
  }],
  sources: [{ id: 'github', name: 'GitHub', tier: 'L1', platform: 'github', region: 'global', mode: 'api', trustClass: 'official', configured: true, enabled: true, schedulable: true, status: 'online', failureCount: 0, lastReceived: 2, lastSaved: 2 }],
  changes: [{ seq: 4, topicId: 'topic-1', changeType: 'new', changedAt: '2026-08-27T02:00:00.000Z', payload: {} }],
}

describe('Vision Monitoring dashboard', () => {
  it('renders real topics, score disclosure, weak-evidence warning, project metrics and source state', async () => {
    const user = userEvent.setup()
    render(<RadarDashboard loadRadar={async () => data} />)

    expect(await screen.findByRole('heading', { name: 'Acme AI Tool' })).toBeInTheDocument()
    expect(screen.getByText('单一来源')).toBeInTheDocument()
    expect(screen.getByText(/42 stars/i)).toBeInTheDocument()
    expect(screen.getByText('在线')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /趋势分 72/ }))
    expect(screen.getByText(/新鲜度 25/)).toBeInTheDocument()
  })

  it('switches windows and reloads the workspace', async () => {
    const user = userEvent.setup()
    const loader = vi.fn<RadarLoader>(async ({ window }) => ({ ...data, window }))
    render(<RadarDashboard loadRadar={loader} />)
    await screen.findByRole('heading', { name: 'Acme AI Tool' })
    await user.click(screen.getByRole('button', { name: '24 小时' }))
    expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ window: '24h' }))
  })

  it('shows honest empty and retryable error states without sample topics', async () => {
    const user = userEvent.setup()
    const loader = vi.fn<RadarLoader>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...data, topics: [], changes: [] })
    render(<RadarDashboard loadRadar={loader} />)
    expect(await screen.findByText('视野监测暂时不可用')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新连接' }))
    expect(await screen.findByText('当前窗口暂无可验证热点')).toBeInTheDocument()
    expect(screen.queryByText('Acme AI Tool')).not.toBeInTheDocument()
  })

  it('does not expose an internal topic id when a change has left the selected window', async () => {
    render(<RadarDashboard loadRadar={async () => ({
      ...data,
      changes: [{ seq: 5, topicId: 'internal-topic-id', changeType: 'updated', changedAt: '2026-08-27T03:00:00.000Z', payload: {} }],
    })} />)

    expect(await screen.findByText('已离开当前时间窗的主题')).toBeInTheDocument()
    expect(screen.queryByText('internal-topic-id')).not.toBeInTheDocument()
  })
})
