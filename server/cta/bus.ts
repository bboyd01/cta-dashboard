/**
 * CTA Bus Tracker v2 provider.
 * Docs: https://www.transitchicago.com/developers/bustracker/
 *
 * getpredictions accepts up to 10 comma-separated stop ids, so every bus stop on
 * the dashboard usually resolves in a single upstream call.
 */

import type { BusRoute, BusStop, Departure } from '../../shared/types.ts'
import { CtaError } from './types.ts'
import { getJson, parseBusTimestamp, text, truthy } from './http.ts'

const BASE = 'https://ctabustracker.com/bustime/api/v2'

/** Documented per-request cap on getpredictions stop ids. */
export const MAX_STOPS_PER_REQUEST = 10

function endpoint(apiKey: string, path: string, params: Record<string, string> = {}): URL {
  if (!apiKey) throw new CtaError('CTA_BUS_API_KEY is not set')
  const url = new URL(`${BASE}/${path}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('format', 'json')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

/** Unwraps the `bustime-response` envelope, raising on a whole-request error. */
function unwrap(body: unknown, label: string): Record<string, unknown> {
  const payload = (body as Record<string, unknown>)?.['bustime-response']
  if (typeof payload !== 'object' || payload === null) {
    throw new CtaError(`${label} returned an unexpected response`)
  }
  const envelope = payload as Record<string, unknown>

  // `error` is per-stop and coexists with results, so it is only fatal when
  // nothing else came back — one dead stop id must not blank the whole card.
  const errors = Array.isArray(envelope.error) ? envelope.error : []
  const hasData = Object.keys(envelope).some((key) => key !== 'error')
  if (errors.length > 0 && !hasData) {
    const message = text((errors[0] as Record<string, unknown>)?.msg, `${label} error`)
    throw new CtaError(message)
  }
  return envelope
}

function list(envelope: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = envelope[key]
  const items = Array.isArray(value) ? value : value ? [value] : []
  return items.filter((item): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null)
}

export async function fetchBusPredictions(apiKey: string, stopIds: string[]): Promise<Departure[]> {
  if (stopIds.length === 0) return []
  if (stopIds.length > MAX_STOPS_PER_REQUEST) {
    throw new CtaError(`at most ${MAX_STOPS_PER_REQUEST} stops per request`)
  }
  const url = endpoint(apiKey, 'getpredictions', { stpid: stopIds.join(',') })
  return parseBusPredictions(await getJson(url, 'Bus Tracker'))
}

/** Exported for tests: turns a raw getpredictions payload into Departures. */
export function parseBusPredictions(body: unknown): Departure[] {
  const envelope = unwrap(body, 'Bus Tracker')
  const departures: Departure[] = []

  for (const row of list(envelope, 'prd')) {
    const arrivalAt = parseBusTimestamp(row.prdtm)
    if (!arrivalAt) continue

    // prdctdn is 'DUE', 'DLY', or a minute count.
    const countdown = text(row.prdctdn).toUpperCase()

    departures.push({
      // rtdd is the public-facing route designator; rt is the internal code.
      route: text(row.rtdd) || text(row.rt),
      destination: text(row.des, 'Unknown'),
      arrivalAt,
      isApproaching: countdown === 'DUE',
      isDelayed: truthy(row.dly) || countdown === 'DLY',
      // 'S' marks a schedule-based estimate rather than a live vehicle.
      isScheduled: text(row.typ).toUpperCase() === 'S',
      stopId: text(row.stpid),
      direction: text(row.rtdir),
    })
  }
  return departures
}

export async function fetchBusRoutes(apiKey: string): Promise<BusRoute[]> {
  const body = await getJson(endpoint(apiKey, 'getroutes'), 'Bus Tracker')
  return list(unwrap(body, 'Bus Tracker'), 'routes').map((row) => ({
    route: text(row.rt),
    name: text(row.rtnm),
  }))
}

export async function fetchBusDirections(apiKey: string, route: string): Promise<string[]> {
  const body = await getJson(endpoint(apiKey, 'getdirections', { rt: route }), 'Bus Tracker')
  return list(unwrap(body, 'Bus Tracker'), 'directions')
    .map((row) => text(row.dir))
    .filter(Boolean)
}

export async function fetchBusStops(
  apiKey: string, route: string, direction: string,
): Promise<BusStop[]> {
  const url = endpoint(apiKey, 'getstops', { rt: route, dir: direction })
  return list(unwrap(await getJson(url, 'Bus Tracker'), 'Bus Tracker'), 'stops').map((row) => ({
    stopId: text(row.stpid),
    name: text(row.stpnm),
  }))
}
