/**
 * CTA Train Tracker ('L') provider.
 * Docs: https://www.transitchicago.com/developers/traintracker/
 *
 * One call per station returns every line and both directions, so a single
 * request serves every card at that station.
 */

import type { Departure } from '../../shared/types.ts'
import { CtaError } from './types.ts'
import { getJson, parseTrainTimestamp, text, truthy } from './http.ts'

const BASE = 'https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx'

/** Most a station needs; the API caps the horizon at ~60 minutes anyway. */
const MAX_RESULTS = 20

export async function fetchTrainArrivals(apiKey: string, mapId: string): Promise<Departure[]> {
  if (!apiKey) throw new CtaError('CTA_TRAIN_API_KEY is not set')

  const url = new URL(BASE)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('mapid', mapId)
  url.searchParams.set('max', String(MAX_RESULTS))
  url.searchParams.set('outputType', 'JSON')

  const body = await getJson(url, 'Train Tracker')
  return parseTrainArrivals(body)
}

/** Exported for tests: turns a raw ttarrivals payload into Departures. */
export function parseTrainArrivals(body: unknown): Departure[] {
  const ctatt = (body as { ctatt?: Record<string, unknown> })?.ctatt
  if (!ctatt) throw new CtaError('Train Tracker returned an unexpected response')

  // errCd '0' is success. Anything else carries a human-readable errNm.
  const errCd = text(ctatt.errCd, '0')
  if (errCd !== '0') {
    throw new CtaError(text(ctatt.errNm, `Train Tracker error ${errCd}`))
  }

  // `eta` is absent when nothing is predicted, and an object (not an array)
  // when exactly one train is due.
  const raw = ctatt.eta
  const etas = Array.isArray(raw) ? raw : raw ? [raw] : []

  const departures: Departure[] = []
  for (const eta of etas) {
    if (typeof eta !== 'object' || eta === null) continue
    const row = eta as Record<string, unknown>
    const arrivalAt = parseTrainTimestamp(row.arrT)
    if (!arrivalAt) continue

    departures.push({
      route: text(row.rt),
      destination: text(row.destNm, 'Unknown'),
      arrivalAt,
      isApproaching: truthy(row.isApp),
      isDelayed: truthy(row.isDly),
      isScheduled: truthy(row.isSch),
      stopId: text(row.stpId),
      direction: text(row.trDr),
    })
  }
  return departures
}
