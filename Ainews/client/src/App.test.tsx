import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import type { NewsArticle } from './features/topic-idea/topic-idea'
import type { RadarData, RadarLoader } from './features/radar/radar-types'

const article: NewsArticle = {
  id: 'source-article',
  title: 'OpenAI 官方公布一项新能力',
  description: '这是来自原始来源的简要说明。',
  source: 'OpenAI',
  url: 'https://openai.com/index/source-article',
  publishedAt: '2026-08-27T03:00:00.000Z',
}

const emptyRadar: RadarData = {
  window: '72h',
  topics: [],
  sources: [],
  changes: [],
  nextCursor: 0,
}

const loadRadar: RadarLoader = async ({ window }) => ({ ...emptyRadar, window })

afterEach(() => {
  document.body.style.pointerEvents = ''
})

describe('Aya cinematic home', () => {
  it('renders the Aya brand, creator promise, navigation, and exact video behavior', () => {
    const { container } = render(<App loadArticles={async () => [article]} loadRadar={loadRadar} random={() => 0} />)

    expect(screen.getByText('Aya Signals')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '在噪声里，先看见下一个值得做的 AI 选题。',
    )
    expect(screen.getByTestId('hero-headline')).toHaveClass(
      'text-[clamp(2rem,8.7vw,2.5rem)]',
      'sm:text-7xl',
    )
    expect(screen.getByText('看热点')).toBeInTheDocument()
    expect(screen.getByText('找选题')).toBeInTheDocument()
    expect(screen.getByText('做研究')).toBeInTheDocument()
    expect(screen.getByText('Aya Skill')).toBeInTheDocument()

    const video = container.querySelector('video') as HTMLVideoElement
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('aria-hidden', 'true')
    expect(video.muted).toBe(true)
    expect(video).toHaveAttribute(
      'src',
      'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4',
    )
    expect(video.parentElement).toBe(screen.getByTestId('hero-shell'))
    expect(video).toHaveClass('absolute', 'inset-0', 'z-0', 'h-full', 'w-full', 'object-cover')
  })

  it('renders standalone topic, research and Skill workspaces instead of raw machine files', async () => {
    const researchFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {
      status: 'ready', notice: '证据包已就绪', angle: '创作者视角',
      diversity: { sources: 2, regions: 2, evidenceTypes: 2 },
      evidence: [{ citationId: 'S1', title: '官方发布', source: 'Official', url: 'https://official.example/item', claimBoundary: '官方一手信息' }],
      outputGuide: { sections: [{ title: '核心结论' }] }, citationPolicy: '逐条引用'
    } }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const topicView = render(<App path="/topics" loadArticles={async () => [article]} random={() => 0} />)
    expect(await screen.findByRole('heading', { name: '创作者选题工作台' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'AI 博主类型' })).toBeInTheDocument()
    topicView.unmount()

    const researchView = render(<App path="/research?topic=Qwen&topicId=topic-qwen" researchFetch={researchFetch as typeof fetch} />)
    expect(screen.getByRole('heading', { name: '研究工作台' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '开始研究' }))
    expect(await screen.findByText('证据包已就绪')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /官方发布/ })).toHaveAttribute('href', 'https://official.example/item')
    expect(String(researchFetch.mock.calls[0][0])).toContain('topicId=topic-qwen')
    const topicInput = screen.getByRole('textbox', { name: '研究主题' })
    await userEvent.clear(topicInput)
    await userEvent.type(topicInput, 'Claude')
    await userEvent.click(screen.getByRole('button', { name: '开始研究' }))
    await waitFor(() => expect(researchFetch).toHaveBeenCalledTimes(2))
    expect(String(researchFetch.mock.calls[1][0])).not.toContain('topicId=')
    researchView.unmount()

    render(<App path="/skills" />)
    expect(screen.getByRole('heading', { name: 'AyaNewsSkill' })).toBeInTheDocument()
    expect(screen.getByText('机器可读接口')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看原始 Skill Markdown' })).toHaveAttribute('href', '/skill.md')
  })

  it('hides the remote video after a media error and keeps the navy page fallback', () => {
    const { container } = render(<App loadArticles={async () => [article]} loadRadar={loadRadar} random={() => 0} />)
    const video = container.querySelector('video') as HTMLVideoElement

    fireEvent.error(video)

    expect(video).toHaveAttribute('data-video-state', 'error')
    expect(video).toHaveClass('opacity-0')
    expect(screen.getByTestId('landing-shell')).toHaveClass('bg-background')
  })

  it('opens an accessible source-backed assignment with a safe evidence link', async () => {
    const user = userEvent.setup()
    render(<App loadArticles={async () => [article]} loadRadar={loadRadar} random={() => 0} />)

    await user.click(screen.getByRole('button', { name: '生成今日选题' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText(article.title)).toBeInTheDocument()
    expect(screen.getByText('来源选题')).toBeInTheDocument()
    expect(screen.getByText('创作角度')).toBeInTheDocument()
    expect(screen.getByText('适合受众')).toBeInTheDocument()
    expect(screen.getByText('今日完成')).toBeInTheDocument()

    const sourceLink = screen.getByRole('link', { name: /查看 OpenAI 原始来源/ })
    expect(sourceLink).toHaveAttribute('href', article.url)
    expect(sourceLink).toHaveAttribute('target', '_blank')
    expect(sourceLink).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('shows real Creator Opportunity scores and evidence risk without inventing them', async () => {
    const user = userEvent.setup()
    render(<App loadArticles={async () => [{
      ...article,
      opportunity: {
        formulaVersion: 'opportunity-v1', creatorScore: 82, trendScore: 73,
        evidenceStrength: 'single-source', lens: '创作者实测', angle: '做一次可复现实测。',
        audience: 'AI 内容创作者', deliverable: '今天完成实测稿。', riskNotes: ['当前只有单一来源证据。'],
      },
    }]} loadRadar={loadRadar} random={() => 0} />)

    await user.click(screen.getByRole('button', { name: '生成今日选题' }))

    expect(await screen.findByText('机会选题')).toBeInTheDocument()
    expect(screen.getByText('Creator 82 · 趋势 73')).toBeInTheDocument()
    expect(screen.getByText('当前只有单一来源证据。')).toBeInTheDocument()
  })

  it('clearly labels practice mode when the live source request is unavailable', async () => {
    const user = userEvent.setup()
    render(<App loadArticles={async () => { throw new Error('offline') }} loadRadar={loadRadar} random={() => 0} />)

    await user.click(screen.getByRole('button', { name: '生成今日选题' }))

    await waitFor(() => expect(screen.getByText('创作练习')).toBeInTheDocument())
    expect(screen.getByText(/实时来源暂不可用/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /原始来源/ })).not.toBeInTheDocument()
  })
})
