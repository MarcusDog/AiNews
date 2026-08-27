import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NewsArticle } from './topic-idea'
import { useTopicIdea } from './use-topic-idea'

const firstArticle: NewsArticle = {
  id: 'first',
  title: '第一条真实来源',
  source: 'Source A',
  url: 'https://source-a.test/story',
}

const secondArticle: NewsArticle = {
  id: 'second',
  title: '第二条真实来源',
  source: 'Source B',
  url: 'https://source-b.test/story',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useTopicIdea', () => {
  it('loads source-backed content only while active', async () => {
    const loadArticles = vi.fn().mockResolvedValue([firstArticle])
    const { result, rerender } = renderHook(
      ({ active }) => useTopicIdea({ active, loadArticles, random: () => 0 }),
      { initialProps: { active: false } },
    )

    expect(loadArticles).not.toHaveBeenCalled()

    rerender({ active: true })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.idea).toMatchObject({
      kind: 'source-backed',
      sourceUrl: firstArticle.url,
    })
    expect(result.current.availability).toBe('source-backed')
  })

  it('aborts the request when the surface closes or unmounts', async () => {
    let observedSignal: AbortSignal | undefined
    const loadArticles = vi.fn((signal: AbortSignal) => {
      observedSignal = signal
      return new Promise<NewsArticle[]>(() => undefined)
    })
    const { unmount } = renderHook(() => useTopicIdea({
      active: true,
      loadArticles,
      random: () => 0,
    }))

    await waitFor(() => expect(loadArticles).toHaveBeenCalledOnce())
    unmount()

    expect(observedSignal?.aborted).toBe(true)
  })

  it('ignores an older response after a close and reopen', async () => {
    const firstRequest = deferred<NewsArticle[]>()
    const secondRequest = deferred<NewsArticle[]>()
    const loadArticles = vi.fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    const { result, rerender } = renderHook(
      ({ active }) => useTopicIdea({ active, loadArticles, random: () => 0 }),
      { initialProps: { active: true } },
    )

    await waitFor(() => expect(loadArticles).toHaveBeenCalledTimes(1))
    rerender({ active: false })
    rerender({ active: true })
    await waitFor(() => expect(loadArticles).toHaveBeenCalledTimes(2))

    await act(async () => secondRequest.resolve([secondArticle]))
    await waitFor(() => expect(result.current.idea?.sourceUrl).toBe(secondArticle.url))

    await act(async () => firstRequest.resolve([firstArticle]))
    expect(result.current.idea?.sourceUrl).toBe(secondArticle.url)
  })

  it('rerolls within the validated source set without inventing a new source', async () => {
    const random = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.999)
    const { result } = renderHook(() => useTopicIdea({
      active: true,
      loadArticles: async () => [firstArticle, secondArticle],
      random,
    }))

    await waitFor(() => expect(result.current.idea?.sourceUrl).toBe(firstArticle.url))

    act(() => result.current.reroll())
    expect(result.current.idea?.sourceUrl).toBe(secondArticle.url)
  })

  it('marks API failure as unavailable practice mode', async () => {
    const { result } = renderHook(() => useTopicIdea({
      active: true,
      loadArticles: async () => { throw new Error('offline') },
      random: () => 0,
    }))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.availability).toBe('unavailable')
    expect(result.current.idea).toMatchObject({ kind: 'practice', label: '创作练习' })
  })
})
