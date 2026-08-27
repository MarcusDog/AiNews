import { useState } from 'react'
import { BackgroundVideo } from '@/components/background-video'
import { Hero } from '@/components/hero'
import { Navigation } from '@/components/navigation'
import { TopicIdeaDialog } from '@/features/topic-idea/topic-idea-dialog'
import type { TopicLoader } from '@/features/topic-idea/use-topic-idea'
import { RadarDashboard } from '@/features/radar/radar-dashboard'
import type { RadarLoader } from '@/features/radar/radar-types'

interface AppProps {
  loadArticles?: TopicLoader
  loadRadar?: RadarLoader
  random?: () => number
}

export default function App({ loadArticles, loadRadar, random }: AppProps) {
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)

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
      <TopicIdeaDialog
        open={topicDialogOpen}
        onOpenChange={setTopicDialogOpen}
        loadArticles={loadArticles}
        random={random}
      />
    </main>
  )
}
