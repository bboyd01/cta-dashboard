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
  tripId: string,
  stopTimeUpdate: InstanceType<typeof transitRealtime.TripUpdate.StopTimeUpdate>[],
) {
  return transitRealtime.FeedEntity.create({
    id,
    tripUpdate: { trip: { tripId }, stopTimeUpdate },
  })
}

describe('decodeTripUpdates', () => {
  it('reads a delay reported on the arrival event', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', 't1', [
        { stopId: 'NAP', arrival: { delay: 300 } },
      ]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.get('t1')?.get('NAP')).toEqual({ skipped: false, delaySeconds: 300, predictedAt: null })
  })

  it('reads an absolute predicted time', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', 't1', [
        { stopId: 'NAP', arrival: { time: 1_800_000_000 } },
      ]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.get('t1')?.get('NAP')).toEqual({
      skipped: false, delaySeconds: null, predictedAt: new Date(1_800_000_000 * 1000).toISOString(),
    })
  })

  it('falls back to the departure event when there is no arrival event', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', 't1', [
        { stopId: 'NAP', departure: { delay: -60 } },
      ]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.get('t1')?.get('NAP')?.delaySeconds).toBe(-60)
  })

  it('marks a skipped stop', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', 't1', [
        {
          stopId: 'NAP',
          scheduleRelationship: transitRealtime.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
        },
      ]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.get('t1')?.get('NAP')?.skipped).toBe(true)
  })

  it('collects multiple stops and multiple trips', () => {
    const feed = encodeFeed([
      tripUpdateEntity('1', 't1', [
        { stopId: 'NAP', arrival: { delay: 60 } },
        { stopId: 'CUS', arrival: { delay: 120 } },
      ]),
      tripUpdateEntity('2', 't2', [{ stopId: 'NAP', arrival: { delay: 0 } }]),
    ])
    const index = decodeTripUpdates(feed)
    expect(index.get('t1')?.get('CUS')?.delaySeconds).toBe(120)
    expect(index.get('t2')?.get('NAP')?.delaySeconds).toBe(0)
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
