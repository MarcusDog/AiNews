import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLatestArticles } from './topic-api'
import { pickTopicIdea, type NewsArticle, type TopicIdea } from './topic-idea'

export type TopicAvailability = 'idle' | 'source-backed' | 'empty' | 'unavailable'
export type TopicIdeaStatus = 'idle' | 'loading' | 'ready'
export type TopicLoader = (signal: AbortSignal) => Promise<NewsArticle[]>

interface UseTopicIdeaOptions {
  active: boolean
  loadArticles?: TopicLoader
  random?: () => number
}

interface UseTopicIdeaResult {
  status: TopicIdeaStatus
  availability: TopicAvailability
  idea: TopicIdea | null
  reroll: () => void
}

const defaultLoader: TopicLoader = (signal) => fetchLatestArticles({ signal })

export function useTopicIdea({
  active,
  loadArticles = defaultLoader,
  random = Math.random,
}: UseTopicIdeaOptions): UseTopicIdeaResult {
  const [status, setStatus] = useState<TopicIdeaStatus>('idle')
  const [availability, setAvailability] = useState<TopicAvailability>('idle')
  const [idea, setIdea] = useState<TopicIdea | null>(null)
  const articlesRef = useRef<NewsArticle[]>([])
  const requestVersionRef = useRef(0)
  const loaderRef = useRef(loadArticles)
  const randomRef = useRef(random)

  loaderRef.current = loadArticles
  randomRef.current = random

  useEffect(() => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    if (!active) {
      articlesRef.current = []
      setStatus('idle')
      setAvailability('idle')
      setIdea(null)
      return undefined
    }

    const controller = new AbortController()
    setStatus('loading')
    setAvailability('idle')
    setIdea(null)

    void loaderRef.current(controller.signal)
      .then((articles) => {
        if (controller.signal.aborted || requestVersionRef.current !== requestVersion) return

        articlesRef.current = articles
        setIdea(pickTopicIdea(articles, randomRef.current))
        setAvailability(articles.length > 0 ? 'source-backed' : 'empty')
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted || requestVersionRef.current !== requestVersion) return

        articlesRef.current = []
        setIdea(pickTopicIdea([], randomRef.current))
        setAvailability('unavailable')
        setStatus('ready')
      })

    return () => controller.abort()
  }, [active])

  const reroll = useCallback(() => {
    if (status !== 'ready') return
    setIdea(pickTopicIdea(articlesRef.current, randomRef.current))
  }, [status])

  return { status, availability, idea, reroll }
}
