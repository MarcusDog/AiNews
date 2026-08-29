import { useState } from 'react'
import { BackgroundVideo } from '@/components/background-video'
import { Hero } from '@/components/hero'
import { Navigation } from '@/components/navigation'
import { TopicIdeaDialog } from '@/features/topic-idea/topic-idea-dialog'
import type { TopicLoader } from '@/features/topic-idea/use-topic-idea'
import { RadarDashboard } from '@/features/radar/radar-dashboard'
import type { RadarLoader } from '@/features/radar/radar-types'
import { CreatorSection } from '@/components/creator-section'
import { CreatorDashboard } from '@/features/creators/creator-dashboard'
import { AlertManager } from '@/features/creators/alert-manager'

interface AppProps {
  loadArticles?: TopicLoader
  loadRadar?: RadarLoader
  random?: () => number
}

type Mode = 'compact' | 'dashboard' | 'alerts'

export default function App({ loadArticles, loadRadar, random }: AppProps) {
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('compact')

  return (
    <main
      data-testid="landing-shell"
      className="relative min-h-svh overflow-x-hidden bg-background text-foreground"
    >
      <section data-testid="hero-shell" className="relative min-h-svh overflow-hidden">
        <BackgroundVideo />
        <Navigation onGenerate={() => setTopicDialogOpen(true)} />
        <Hero onGenerate={() => setTopicDialogOpen(true)} />
      </section>
      <RadarDashboard loadRadar={loadRadar} />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 pb-4 pt-2 sm:px-8">
        <button
          type="button"
          onClick={() => setMode(mode === 'dashboard' ? 'compact' : 'dashboard')}
          className={`rounded-full px-5 py-2 text-xs ${mode === 'dashboard' ? 'bg-white text-[#031a26]' : 'border border-white/15 bg-white/[0.04] text-white/65 hover:text-white'}`}
          aria-pressed={mode === 'dashboard'}
        >
          {mode === 'dashboard' ? '收起完整博主雷达' : '打开完整博主雷达（大组建）'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'alerts' ? 'compact' : 'alerts')}
          className={`rounded-full px-5 py-2 text-xs ${mode === 'alerts' ? 'bg-white text-[#031a26]' : 'border border-white/15 bg-white/[0.04] text-white/65 hover:text-white'}`}
          aria-pressed={mode === 'alerts'}
        >
          {mode === 'alerts' ? '收起热点推送管理' : '打开热点推送管理（alerts）'}
        </button>
      </div>
      {mode === 'dashboard' ? <CreatorDashboard initialVertical="ai-tech" /> : null}
      {mode === 'alerts' ? <AlertManager /> : null}
      {mode === 'compact' ? <CreatorSection /> : null}
      <TopicIdeaDialog
        open={topicDialogOpen}
        onOpenChange={setTopicDialogOpen}
        loadArticles={loadArticles}
        random={random}
      />
    </main>
  )
}
