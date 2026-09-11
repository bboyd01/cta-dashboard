import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardDepartures } from '../../shared/types.ts'
import { api } from '../api.ts'

const REFRESH_MS = 30_000
/** Past this age the data is no longer trustworthy enough to show undimmed. */
const STALE_AFTER_MS = 90_000

export type DeparturesState = {
  data: CardDepartures[]
  error: string | null
  loading: boolean
  updatedAt: Date | null
  isStale: boolean
  refresh: () => void
}

/**
 * Polls /api/departures every 30s.
 *
 * Polling stops while the tab is hidden and resumes with an immediate fetch when
 * it comes back. That keeps a backgrounded dashboard from spending the day
 * burning through the CTA's daily request budget.
 */
export function useDepartures(enabled: boolean): DeparturesState {
  const [data, setData] = useState<CardDepartures[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const next = await api.departures()
      setData(next)
      setUpdatedAt(new Date())
      setError(null)
    } catch (cause) {
      // Keep the last good data on screen; the staleness dim signals its age.
      setError(cause instanceof Error ? cause.message : 'Could not reach the server')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setData([])
      setLoading(false)
      return
    }

    let timer: number | undefined
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
      timer = window.setTimeout(tick, REFRESH_MS)
    }
    tick()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, load])

  // Drives countdowns down between fetches so '7 min' does not sit for 30s.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const isStale = updatedAt !== null && now - updatedAt.getTime() > STALE_AFTER_MS

  return { data, error, loading, updatedAt, isStale, refresh: () => void load() }
}
