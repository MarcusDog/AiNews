import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRadar } from './radar-api'
import type { RadarData, RadarLoader, RadarWindow } from './radar-types'

export type RadarStatus = 'loading' | 'ready' | 'empty' | 'error'

export function useRadar(loadRadar: RadarLoader = fetchRadar) {
  const [window, setWindow] = useState<RadarWindow>('72h')
  const [status, setStatus] = useState<RadarStatus>('loading')
  const [data, setData] = useState<RadarData | null>(null)
  const [version, setVersion] = useState(0)
  const loaderRef = useRef(loadRadar)
  const requestRef = useRef(0)
  loaderRef.current = loadRadar

  useEffect(() => {
    const request = requestRef.current + 1
    requestRef.current = request
    const controller = new AbortController()
    setStatus('loading')
    void loaderRef.current({ window, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted || requestRef.current !== request) return
        setData(next)
        setStatus(next.topics.length ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError' || requestRef.current !== request) return
        setData(null)
        setStatus('error')
      })
    return () => controller.abort()
  }, [window, version])

  const retry = useCallback(() => setVersion((value) => value + 1), [])
  return { window, setWindow, status, data, retry }
}
