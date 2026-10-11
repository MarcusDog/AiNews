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
import { CreatorDashboard } from '@/features/creators/creator-dashboard'
import { CreatorProfile } from '@/features/creators/creator-profile'
import { VerticalDashboard } from '@/features/creators/vertical-dashboard'
import { SourceCoverage } from '@/features/creators/source-coverage'
import { AlertManager } from '@/features/creators/alert-manager'
import type { CreatorApiClient, CreatorStreamFactory } from '@/features/creators/creator-types'

interface AppProps {
  loadArticles?: TopicLoader
  loadRadar?: RadarLoader
  random?: () => number
  path?: string
  researchFetch?: typeof fetch
  creatorApi?: CreatorApiClient
  creatorStreamFactory?: CreatorStreamFactory
}

function currentPath(path?: string) {
  if (path) return path
  if (window.location.hash.startsWith('#/')) return window.location.hash.slice(1)
  return `${window.location.pathname}${window.location.search}`
}

export default function App({ loadArticles, loadRadar, random, path, researchFetch, creatorApi, creatorStreamFactory }: AppProps) {
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)
  const requestedPath = currentPath(path)
  const pathname = new URL(requestedPath, 'https://ainews.local').pathname

  if (pathname === '/topics') return <TopicWorkbench loadArticles={loadArticles} random={random} />
  if (pathname === '/research') return <ResearchWorkbench path={requestedPath} fetchImpl={researchFetch} />
  if (pathname === '/skills') return <SkillPage />
  if (pathname === '/creators') return <CreatorDashboard api={creatorApi} streamFactory={creatorStreamFactory} />
  if (pathname.startsWith('/creators/')) return <CreatorProfile id={decodeURIComponent(pathname.slice('/creators/'.length))} api={creatorApi} />
  if (pathname.startsWith('/verticals/')) return <VerticalDashboard id={decodeURIComponent(pathname.slice('/verticals/'.length))} api={creatorApi} streamFactory={creatorStreamFactory} />
  if (pathname === '/sources') return <SourceCoverage api={creatorApi} />
  if (pathname === '/alerts') return <AlertManager api={creatorApi} />

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
