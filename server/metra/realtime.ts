/**
 * Metra GTFS-realtime trip updates: per-stop delays and skipped stops for
 * trips already on the static schedule.
 *
 * This intentionally does not touch the static schedule at all — it is a
 * second, independent signal that `MetraScheduleIndex.departuresAt` overlays
 * onto the scheduled times it already computed, matched by (trip_id, stop_id).
 * A trip absent from this feed (not yet running, or the feed is down) simply
 * falls back to its scheduled time, which is what makes this safe to bolt on:
 * nothing about the schedule-only path changes when realtime is unavailable.
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

/** trip_id -> stop_id -> live status. */
export type MetraRealtimeIndex = Map<string, Map<string, MetraStopStatus>>

const FETCH_TIMEOUT_MS = 15_000
const TRIP_UPDATES_URL = 'https://gtfspublic.metrarr.com/gtfs/public/tripupdates'

/**
 * protobufjs gives every scalar field its proto3 zero value (0) when absent
 * from the wire, rather than `null` or `undefined` — despite the .d.ts typing
 * them as nullable. The only way to tell "explicitly zero" from "not sent" is
 * to check for the field as an *own* property: decode only assigns one when
 * its wire tag was actually present (see gtfs-realtime.js's StopTimeEvent.decode).
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

/** Downloads and decodes Metra's GTFS-realtime trip updates feed. */
export async function fetchMetraTripUpdates(apiKey: string): Promise<MetraRealtimeIndex> {
  const target = new URL(TRIP_UPDATES_URL)
  if (apiKey) target.searchParams.set('api_token', apiKey)

  let response: Response
  try {
    response = await fetch(target, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    })
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

  const index: MetraRealtimeIndex = new Map()
  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate
    const tripId = tripUpdate?.trip?.tripId
    if (!tripUpdate || !tripId) continue

    const stops: Map<string, MetraStopStatus> = index.get(tripId) ?? new Map()
    index.set(tripId, stops)

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate ?? []) {
      const stopId = stopTimeUpdate.stopId
      if (!stopId) continue

      const event = stopTimeUpdate.arrival ?? stopTimeUpdate.departure
      const predictedSeconds = toEpochSeconds(ownField(event, 'time'))
      stops.set(stopId, {
        skipped: stopTimeUpdate.scheduleRelationship === StopTimeUpdateRelationship.SKIPPED,
        delaySeconds: ownField(event, 'delay'),
        predictedAt: predictedSeconds !== null ? new Date(predictedSeconds * 1000).toISOString() : null,
      })
    }
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
  if (!apiKey) return new Map()
  return realtimeCache.get('tripupdates', async () => {
    try {
      return await fetchMetraTripUpdates(apiKey)
    } catch (error) {
      console.warn(
        `[metra] realtime trip updates unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      return new Map()
    }
  })
}
