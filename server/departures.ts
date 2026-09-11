/**
 * Turns the configured cards into departure lists.
 *
 * The batching here is the other half of the rate-limit story. Cards are grouped
 * before any request goes out: every train card at a station shares one station
 * call, and every bus stop on the dashboard shares one prediction call per ten
 * stops. Adding a second card at a station you already watch costs nothing.
 */

import type { Card, CardDepartures, Departure } from '../shared/types.ts'
import { sortAndPrune } from '../shared/format.ts'
import type { CtaProvider } from './cta/types.ts'
import { MAX_STOPS_PER_REQUEST } from './cta/bus.ts'
import type { TtlCache } from './cache.ts'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Upstream request failed'
}

/** Cards whose stop ids all appear in `stopIds` draw from this batch. */
function batchKey(prefix: string, ids: string[]): string {
  return `${prefix}:${[...ids].sort().join(',')}`
}

export async function loadDepartures(
  cards: Card[],
  provider: CtaProvider,
  cache: TtlCache,
  now: Date = new Date(),
  { fresh = false } = {},
): Promise<CardDepartures[]> {
  const read = <T>(key: string, load: () => Promise<T>) =>
    fresh ? cache.refresh(key, load) : cache.get(key, load)

  // One request per station, shared by every train card watching it.
  const stationIds = [...new Set(cards.filter((c) => c.kind === 'train').map((c) => c.stationId))]
  const stationResults = new Map<string, Departure[] | Error>()
  await Promise.all(
    stationIds.map(async (mapId) => {
      try {
        stationResults.set(mapId, await read(`train:${mapId}`, () => provider.trainArrivals(mapId)))
      } catch (error) {
        stationResults.set(mapId, error instanceof Error ? error : new Error(message(error)))
      }
    }),
  )

  // One request per ten bus stops, shared by every bus card using those stops.
  const busStopIds = [...new Set(cards.filter((c) => c.kind === 'bus').flatMap((c) => c.stopIds))]
  const busBatches = chunk(busStopIds, MAX_STOPS_PER_REQUEST)
  const busByStop = new Map<string, Departure[]>()
  const busErrors = new Map<string, Error>()
  await Promise.all(
    busBatches.map(async (ids) => {
      try {
        const departures = await read(batchKey('bus', ids), () => provider.busPredictions(ids))
        for (const id of ids) busByStop.set(id, [])
        for (const departure of departures) {
          busByStop.get(departure.stopId)?.push(departure)
        }
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(message(error))
        for (const id of ids) busErrors.set(id, failure)
      }
    }),
  )

  return cards.map((card) => {
    const stopIds = new Set(card.stopIds)

    if (card.kind === 'train') {
      const result = stationResults.get(card.stationId)
      if (result instanceof Error) return { cardId: card.id, departures: [], error: result.message }
      // A station serves several lines, so filter to this card's line as well as
      // its stops -- the stop id alone is not enough at a shared platform.
      const matching = (result ?? []).filter(
        (d) => d.route === card.route && stopIds.has(d.stopId),
      )
      return { cardId: card.id, departures: sortAndPrune(matching, now) }
    }

    const failure = card.stopIds.map((id) => busErrors.get(id)).find(Boolean)
    if (failure) return { cardId: card.id, departures: [], error: failure.message }
    const matching = card.stopIds.flatMap((id) => busByStop.get(id) ?? [])
    return { cardId: card.id, departures: sortAndPrune(matching, now) }
  })
}
