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
