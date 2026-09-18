/**
 * The HTTP surface. Deliberately thin: every route resolves dependencies from
 * `deps` and delegates, so the interesting behaviour stays in tested modules.
 */

import express, { type Router } from 'express'
import type { Config } from '../../shared/types.ts'
import { LINES } from '../../shared/lines.ts'
import { METRA_LINES } from '../../shared/metraLines.ts'
import type { ConfigStore } from '../config-store.ts'
import type { TtlCache } from '../cache.ts'
import type { CtaProvider } from '../cta/types.ts'
import type { StationIndex } from '../stations/index.ts'
import type { MetraScheduleIndex } from '../metra/schedule.ts'
import { getMetraRealtimeStatus } from '../metra/realtime.ts'
import { loadDepartures } from '../departures.ts'

export type ApiDeps = {
  store: ConfigStore
  provider: CtaProvider
  cache: TtlCache
  stations: () => StationIndex
  metraStations: () => MetraScheduleIndex
  mock: boolean
  discordConfigured: boolean
  metraApiKeyConfigured: boolean
  buildVersion: string
}

/** Bus catalog calls are cached far longer than predictions — routes rarely move. */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

function fail(res: express.Response, status: number, message: string): void {
  res.status(status).json({ error: message })
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = express.Router()
  const catalogCache = new Map<string, { value: unknown; expiresAt: number }>()

  /** Separate from the prediction cache so a 24h entry cannot occupy a 30s slot. */
  async function catalog<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = catalogCache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.value as T
    const value = await load()
    catalogCache.set(key, { value, expiresAt: Date.now() + CATALOG_TTL_MS })
    return value
  }

  router.get('/health', (_req, res) => {
    const stations = deps.stations()
    const metraStations = deps.metraStations()
    res.json({
      ok: true,
      mock: deps.mock,
      buildVersion: deps.buildVersion,
      discordConfigured: deps.discordConfigured,
      stations: {
        source: stations.file.source,
        fetchedAt: stations.file.fetchedAt,
        count: stations.stations.length,
      },
      metraStations: {
        source: metraStations.file.source,
        fetchedAt: metraStations.file.fetchedAt,
        count: metraStations.stations.length,
        tripCount: metraStations.file.trips.length,
      },
      // Not populated in mock mode -- mock synthesizes its own overlay and
      // never calls the real fetch this reports on. `keyConfigured: false`
      // with a null fetchedAt means METRA_API_KEY isn't set in this
      // environment at all, before any network call is even attempted.
      metraRealtime: { keyConfigured: deps.metraApiKeyConfigured, ...getMetraRealtimeStatus() },
    })
  })

  router.get('/config', (_req, res) => {
    res.json(deps.store.get())
  })

  router.put('/config', async (req, res) => {
    // sanitizeConfig inside the store is the validation boundary, so an
    // unexpected body shape is normalized rather than rejected.
    const saved = await deps.store.save(req.body as Config)
    res.json(saved)
  })

  router.get('/departures', async (_req, res) => {
    try {
      res.json(await loadDepartures(deps.store.get().cards, deps.provider, deps.cache))
    } catch (error) {
      fail(res, 502, error instanceof Error ? error.message : 'Failed to load departures')
    }
  })

  /* ---- catalog: reference data for the card picker ---- */

  router.get('/catalog/lines', (_req, res) => {
    res.json(Object.values(LINES).map(({ id, name, color }) => ({ id, name, color })))
  })

  router.get('/catalog/stations', (req, res) => {
    const line = typeof req.query.line === 'string' ? req.query.line : ''
    const index = deps.stations()
    res.json({
      isSeed: index.isSeed,
      stations: line ? index.byLine(line) : index.stations,
    })
  })

  router.get('/catalog/metra/lines', (_req, res) => {
    res.json(Object.values(METRA_LINES).map(({ id, name, color }) => ({ id, name, color })))
  })

  router.get('/catalog/metra/stations', (req, res) => {
    const line = typeof req.query.line === 'string' ? req.query.line : ''
    const index = deps.metraStations()
    res.json({
      isSeed: index.isSeed,
      stations: line ? index.byLine(line) : index.stations,
    })
  })

  router.get('/catalog/bus/routes', async (_req, res) => {
    try {
      res.json(await catalog('routes', () => deps.provider.busRoutes()))
    } catch (error) {
      fail(res, 502, error instanceof Error ? error.message : 'Failed to load bus routes')
    }
  })

  router.get('/catalog/bus/directions', async (req, res) => {
    const route = typeof req.query.rt === 'string' ? req.query.rt : ''
    if (!route) return fail(res, 400, 'rt is required')
    try {
      res.json(await catalog(`dir:${route}`, () => deps.provider.busDirections(route)))
    } catch (error) {
      fail(res, 502, error instanceof Error ? error.message : 'Failed to load directions')
    }
  })

  router.get('/catalog/bus/stops', async (req, res) => {
    const route = typeof req.query.rt === 'string' ? req.query.rt : ''
    const direction = typeof req.query.dir === 'string' ? req.query.dir : ''
    if (!route || !direction) return fail(res, 400, 'rt and dir are required')
    try {
      res.json(
        await catalog(`stops:${route}:${direction}`, () => deps.provider.busStops(route, direction)),
      )
    } catch (error) {
      fail(res, 502, error instanceof Error ? error.message : 'Failed to load stops')
    }
  })

  return router
}
