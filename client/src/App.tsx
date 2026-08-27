import { useState } from 'react'
import { BackgroundVideo } from '@/components/background-video'
import { Hero } from '@/components/hero'
import { Navigation } from '@/components/navigation'
import { TopicIdeaDialog } from '@/features/topic-idea/topic-idea-dialog'
import type { TopicLoader } from '@/features/topic-idea/use-topic-idea'
import { RadarDashboard } from '@/features/radar/radar-dashboard'
import type { RadarLoader } from '@/features/radar/radar-types'
import { TopicWorkbench } from '@/features/topic-idea/topic-workbench'
import { ResearchWorkbench } from '@/features/research/research-workbench'
import { SkillPage } from '@/features/skill/skill-page'

interface AppProps {
  loadArticles?: TopicLoader
  loadRadar?: RadarLoader
  random?: () => number
  path?: string
  researchFetch?: typeof fetch
}

function currentPath(path?: string) {
  if (path) return path
  if (window.location.hash.startsWith('#/')) return window.location.hash.slice(1)
  return `${window.location.pathname}${window.location.search}`
}

export default function App({ loadArticles, loadRadar, random, path, researchFetch }: AppProps) {
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)
  const requestedPath = currentPath(path)
  const pathname = new URL(requestedPath, 'https://ainews.local').pathname

  if (pathname === '/topics') return <TopicWorkbench loadArticles={loadArticles} random={random} />
  if (pathname === '/research') return <ResearchWorkbench path={requestedPath} fetchImpl={researchFetch} />
  if (pathname === '/skills') return <SkillPage />

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
