/**
 * Metra GTFS-realtime trip updates: per-stop delays and skipped stops for
 * trips already on the static schedule.
 *
 * This intentionally does not touch the static schedule at all — it is a
 * second, independent signal that `MetraScheduleIndex.departuresAt` overlays
 * onto the scheduled times it already computed. A trip absent from this feed
 * (not yet running, or the feed is down) simply falls back to its scheduled
 * time, which is what makes this safe to bolt on: nothing about the
 * schedule-only path changes when realtime is unavailable.
 *
 * Matching a realtime entity back to a static trip is the fragile part of any
 * GTFS-realtime integration: agencies frequently regenerate trip_id strings
 * between static publishes without keeping the realtime feed in lockstep, and
 * not every StopTimeUpdate carries a stop_id (some only give stop_sequence).
 * So every lookup here tries, in order: the trip_id itself; failing that, the
 * (route_id, direction_id, start_time) triple GTFS-realtime's own spec
 * recommends as the fallback trip key; and for a given trip, stop_id before
 * falling back to stop_sequence. `MetraScheduleIndex` never talks to a raw Map
 * for this reason — it always goes through `MetraRealtimeIndex.statusFor`.
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import type Long from 'long'
import { TtlCache } from '../cache.ts'

const { transit_realtime: transitRealtime } = GtfsRealtimeBindings

/** One stop's live status within a trip. */
export type MetraStopStatus = {
  /** Seconds early (negative) or late (positive), when the feed gives a delay. */
  delaySeconds: number | null
  /** An absolute predicted time, when the feed gives one instead of a delay. */
  predictedAt: string | null
  /** The train is not calling at this stop after all. */
  skipped: boolean
}

type StopUpdateEntry = { stopId: string | null; stopSequence: number | null; status: MetraStopStatus }

/** What a static trip needs to supply to look itself up in the realtime feed. */
export type TripKey = { tripId: string; routeId: string; directionId: '0' | '1'; startTime: string }

const FETCH_TIMEOUT_MS = 15_000
const TRIP_UPDATES_URL = 'https://gtfspublic.metrarr.com/gtfs/public/tripupdates'

/**
 * protobufjs gives every scalar field its proto3 zero value (0 or '') when
 * absent from the wire, rather than `null` or `undefined` — despite the
 * .d.ts typing many of them as nullable. The only way to tell "explicitly
 * zero" from "not sent" is to check for the field as an *own* property:
 * decode only assigns one when its wire tag was actually present (see
 * gtfs-realtime.js's *.decode functions).
 */
function ownField<T extends object, K extends keyof T>(
  value: T | null | undefined,
  key: K,
): Exclude<T[K], null | undefined> | null {
  if (!value || !Object.prototype.hasOwnProperty.call(value, key)) return null
  return value[key] as Exclude<T[K], null | undefined>
}

function toEpochSeconds(value: number | Long | null): number | null {
  if (value === null) return null
  return typeof value === 'number' ? value : value.toNumber()
}

function routeDirectionStartKey(routeId: string, directionId: string, startTime: string): string {
  return `${routeId}|${directionId}|${startTime}`
}

/** Decoded trip updates, ready to be matched against static trips. See the module doc for the matching order. */
export class MetraRealtimeIndex {
  #byTripId = new Map<string, StopUpdateEntry[]>()
  #byRouteDirectionStart = new Map<string, StopUpdateEntry[]>()

  static empty(): MetraRealtimeIndex {
    return new MetraRealtimeIndex()
  }

  /** Exported for tests: registers one decoded trip's stop updates under both lookup keys. */
  _add(tripId: string, fallbackKey: string | null, entries: StopUpdateEntry[]): void {
    this.#byTripId.set(tripId, entries)
    if (fallbackKey) this.#byRouteDirectionStart.set(fallbackKey, entries)
  }

  get size(): number {
    return this.#byTripId.size
  }

  #entriesFor(trip: TripKey): StopUpdateEntry[] | undefined {
    return (
      this.#byTripId.get(trip.tripId) ??
      this.#byRouteDirectionStart.get(routeDirectionStartKey(trip.routeId, trip.directionId, trip.startTime))
    )
  }

  /** The live status for one stop on one trip, trying stop_id then stop_sequence. */
  statusFor(trip: TripKey, stop: { stopId: string; sequence: number }): MetraStopStatus | undefined {
    const entries = this.#entriesFor(trip)
    if (!entries) return undefined
    return (
      entries.find((e) => e.stopId !== null && e.stopId === stop.stopId)?.status ??
      entries.find((e) => e.stopId === null && e.stopSequence === stop.sequence)?.status
    )
  }
}

/**
 * Downloads and decodes Metra's GTFS-realtime trip updates feed.
 *
 * Auth is the `api_token` query parameter alone -- confirmed against a known-
 * working third-party integration (benwittbrodt/metra-tracker). An earlier
 * version of this also sent an `Authorization: Bearer` header "for
 * compatibility"; that was never documented or verified, and is the likely
 * reason every request was failing outright (a healthy schedule.zip fetch
 * proved the key itself was good, so the failure had to be something specific
 * to this endpoint).
 */
export async function fetchMetraTripUpdates(apiKey: string): Promise<MetraRealtimeIndex> {
  const target = new URL(TRIP_UPDATES_URL)
  if (apiKey) target.searchParams.set('api_token', apiKey)

  let response: Response
  try {
    response = await fetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    throw new Error(timedOut ? 'Metra trip updates timed out' : 'Metra trip updates unreachable', {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new Error(`Metra trip updates returned HTTP ${response.status}`)
  }

  return decodeTripUpdates(new Uint8Array(await response.arrayBuffer()))
}

/** Exported for tests: turns an already-downloaded trip updates protobuf into our index. */
export function decodeTripUpdates(buffer: Uint8Array): MetraRealtimeIndex {
  const feed = transitRealtime.FeedMessage.decode(buffer)
  const StopTimeUpdateRelationship = transitRealtime.TripUpdate.StopTimeUpdate.ScheduleRelationship

  const index = MetraRealtimeIndex.empty()
  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate
    const trip = tripUpdate?.trip
    const tripId = trip?.tripId
    if (!tripUpdate || !trip || !tripId) continue

    const entries: StopUpdateEntry[] = []
    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate ?? []) {
      const event = stopTimeUpdate.arrival ?? stopTimeUpdate.departure
      const predictedSeconds = toEpochSeconds(ownField(event, 'time'))
      entries.push({
        stopId: ownField(stopTimeUpdate, 'stopId'),
        stopSequence: ownField(stopTimeUpdate, 'stopSequence'),
        status: {
          skipped: stopTimeUpdate.scheduleRelationship === StopTimeUpdateRelationship.SKIPPED,
          delaySeconds: ownField(event, 'delay'),
          predictedAt: predictedSeconds !== null ? new Date(predictedSeconds * 1000).toISOString() : null,
        },
      })
    }
    if (entries.length === 0) continue

    const routeId = ownField(trip, 'routeId')
    const startTime = ownField(trip, 'startTime')
    // direction_id is genuinely optional in GTFS-realtime and, unlike route_id
    // and start_time, its absence doesn't make the key ambiguous -- 0 is also
    // the default this dashboard already assumes for a static trip with no
    // direction_id (see the '0'/'1' parsing in schedule.ts), so treating an
    // unset field the same way here keeps the two sides matchable.
    const fallbackKey = routeId && startTime
      ? routeDirectionStartKey(routeId, trip.directionId === 1 ? '1' : '0', startTime)
      : null

    index._add(tripId, fallbackKey, entries)
  }
  return index
}

/** Trip updates change often; a much shorter TTL than the static schedule's. */
const REALTIME_TTL_MS = 25_000
const realtimeCache = new TtlCache(REALTIME_TTL_MS)

/**
 * Cached accessor: every station polled in the same cycle shares one fetch of
 * the (system-wide) trip updates feed. A failure -- no key, network down, a
 * malformed payload -- degrades to an empty index rather than an error, since
 * realtime is an overlay on top of the schedule, never a requirement for it.
 */
export async function getMetraRealtimeIndex(apiKey: string): Promise<MetraRealtimeIndex> {
  if (!apiKey) return MetraRealtimeIndex.empty()
  return realtimeCache.get('tripupdates', async () => {
    try {
      const index = await fetchMetraTripUpdates(apiKey)
      lastStatus = { fetchedAt: new Date().toISOString(), error: null, tripCount: index.size }
      return index
    } catch (error) {
      lastStatus = {
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        tripCount: 0,
      }
      console.warn(`[metra] realtime trip updates unavailable: ${lastStatus.error}`)
      return MetraRealtimeIndex.empty()
    }
  })
}

export type MetraRealtimeStatus = { fetchedAt: string | null; error: string | null; tripCount: number }

let lastStatus: MetraRealtimeStatus = { fetchedAt: null, error: null, tripCount: 0 }

/** Exposed for /api/health: the outcome of the most recent trip updates fetch, for debugging without shell access. */
export function getMetraRealtimeStatus(): MetraRealtimeStatus {
  return lastStatus
}
