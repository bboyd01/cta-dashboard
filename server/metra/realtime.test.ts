import { describe, it, expect } from 'vitest'
import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { decodeTripUpdates, getMetraRealtimeIndex } from './realtime.ts'

const { transit_realtime: transitRealtime } = GtfsRealtimeBindings

/** Encodes a minimal, valid trip-updates FeedMessage, mirroring what Metra publishes. */
function encodeFeed(entities: InstanceType<typeof transitRealtime.FeedEntity>[]): Uint8Array {
  const message = transitRealtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0' },
    entity: entities,
  })
  return transitRealtime.FeedMessage.encode(message).finish()
}

function tripUpdateEntity(
  id: string,
  trip: { tripId: string; routeId?: string; directionId?: number; startTime?: string },
  stopTimeUpdate: InstanceType<typeof transitRealtime.TripUpdate.StopTimeUpdate>[],
) {
  return transitRealtime.FeedEntity.create({ id, tripUpdate: { trip, stopTimeUpdate } })
}

/** Looks a stop up purely by trip_id, the primary (non-fallback) matching path. */
function byTripId(index: ReturnType<typeof decodeTripUpdates>, tripId: string, stopId: string, sequence = 0) {
  return index.statusFor({ tripId, routeId: 'ignored', directionId: '0', startTime: 'ignored' }, { stopId, sequence })
}

describe('decodeTripUpdates', () => {
  it('reads a delay reported on the arrival event', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [{ stopId: 'NAP', arrival: { delay: 300 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(byTripId(index, 't1', 'NAP')).toEqual({ skipped: false, delaySeconds: 300, predictedAt: null })
  })

  it('reads an absolute predicted time', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [{ stopId: 'NAP', arrival: { time: 1_800_000_000 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(byTripId(index, 't1', 'NAP')).toEqual({
      skipped: false, delaySeconds: null, predictedAt: new Date(1_800_000_000 * 1000).toISOString(),
    })
  })

  it('falls back to the departure event when there is no arrival event', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [{ stopId: 'NAP', departure: { delay: -60 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(byTripId(index, 't1', 'NAP')?.delaySeconds).toBe(-60)
  })

  it('marks a skipped stop', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [
        {
          stopId: 'NAP',
          scheduleRelationship: transitRealtime.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
        },
      ]),
    ])
    const index = decodeTripUpdates(feed)
    expect(byTripId(index, 't1', 'NAP')?.skipped).toBe(true)
  })

  it('collects multiple stops and multiple trips', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [
        { stopId: 'NAP', arrival: { delay: 60 } },
        { stopId: 'CUS', arrival: { delay: 120 } },
      ]),
      tripUpdateEntity('2', { tripId: 't2' }, [{ stopId: 'NAP', arrival: { delay: 0 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(byTripId(index, 't1', 'CUS')?.delaySeconds).toBe(120)
    expect(byTripId(index, 't2', 'NAP')?.delaySeconds).toBe(0)
  })

  it('falls back to stop_sequence when a stop update has no stop_id', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', { tripId: 't1' }, [{ stopSequence: 5, arrival: { delay: 90 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.statusFor(
      { tripId: 't1', routeId: 'ignored', directionId: '0', startTime: 'ignored' },
      { stopId: 'NAP', sequence: 5 },
    )?.delaySeconds).toBe(90)
  })

  it('falls back to (route_id, direction_id, start_time) when trip_id does not match', () => {
    const feed = encodeFeed([
      tripUpdateEntity(
        '1',
        { tripId: 'realtime-only-id', routeId: 'UP-N', directionId: 1, startTime: '07:10:00' },
        [{ stopId: 'NAP', arrival: { delay: 240 } }],
      ),
    ])
    const index = decodeTripUpdates(feed)
    // The static trip_id ('static-id') is different from the realtime one, so
    // only the route/direction/start-time fallback can find this update.
    const status = index.statusFor(
      { tripId: 'static-id', routeId: 'UP-N', directionId: '1', startTime: '07:10:00' },
      { stopId: 'NAP', sequence: 0 },
    )
    expect(status?.delaySeconds).toBe(240)
  })

  it('ignores entities with no trip update or trip id', () => {
    const feed = encodeFeed([transitRealtime.FeedEntity.create({ id: '1' })])
    expect(decodeTripUpdates(feed).size).toBe(0)
  })

  it('returns an empty index for a feed with no entities', () => {
    expect(decodeTripUpdates(encodeFeed([])).size).toBe(0)
  })
})

describe('getMetraRealtimeIndex', () => {
  it('short-circuits to an empty index without a key, making no network call', async () => {
    const index = await getMetraRealtimeIndex('')
    expect(index.size).toBe(0)
  })
})
