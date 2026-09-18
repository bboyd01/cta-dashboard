import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildMetraSchedule, loadMetraSchedule, MetraScheduleIndex } from './schedule.ts'
import type { GtfsFeed } from './gtfs.ts'

/** A minimal but complete feed: one route, two stations, one round trip. */
function feed(overrides: Partial<GtfsFeed> = {}): GtfsFeed {
  return {
    routes: [{ route_id: 'BNSF', route_long_name: 'BNSF Railway' }],
    stops: [
      { stop_id: 'NAP', stop_name: 'Naperville' },
      { stop_id: 'CUS', stop_name: 'Chicago Union Station' },
    ],
    trips: [
      { trip_id: 't1', route_id: 'BNSF', service_id: 'WEEKDAY', direction_id: '1', trip_headsign: 'Chicago Union Station' },
    ],
    stopTimes: [
      { trip_id: 't1', stop_id: 'NAP', arrival_time: '07:00:00', stop_sequence: '1' },
      { trip_id: 't1', stop_id: 'CUS', arrival_time: '07:35:00', stop_sequence: '2' },
    ],
    calendar: [
      {
        service_id: 'WEEKDAY',
        monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1',
        saturday: '0', sunday: '0',
        start_date: '20260101', end_date: '20261231',
      },
    ],
    calendarDates: [],
    ...overrides,
  }
}

describe('buildMetraSchedule', () => {
  it('groups stops into stations by name, one platform per direction', () => {
    const schedule = buildMetraSchedule(feed())
    const names = schedule.stations.map((s) => s.name).sort()
    expect(names).toEqual(['Chicago Union Station', 'Naperville'])

    const naperville = schedule.stations.find((s) => s.name === 'Naperville')!
    expect(naperville.lines).toEqual(['BNSF'])
    expect(naperville.stops).toEqual([
      { stopId: 'NAP:1', direction: '1', label: 'Chicago Union Station-bound', lines: ['BNSF'] },
    ])
  })

  it('drops trips on routes it does not recognize', () => {
    const schedule = buildMetraSchedule(
      feed({ routes: [{ route_id: 'NOT-A-REAL-LINE', route_long_name: 'Mystery' }] }),
    )
    expect(schedule.stations).toEqual([])
    expect(schedule.trips).toEqual([])
  })

  it('carries the calendar and exceptions through untouched', () => {
    const schedule = buildMetraSchedule(
      feed({ calendarDates: [{ service_id: 'WEEKDAY', date: '20260704', exception_type: '2' }] }),
    )
    expect(schedule.calendar.WEEKDAY.days).toEqual([false, true, true, true, true, true, false])
    expect(schedule.exceptions.WEEKDAY['20260704']).toBe(2)
  })
})

/**
 * `departuresAt` deliberately checks the day either side of `now` too (see its
 * doc comment), so isolating one calendar day's behavior means keeping the
 * adjacent days out of the calendar's date range -- otherwise a weekday
 * neighboring the day under test would contribute its own departure.
 */
function calendarWindow(startDate: string, endDate: string) {
  return {
    service_id: 'WEEKDAY',
    monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1',
    saturday: '0', sunday: '0',
    start_date: startDate, end_date: endDate,
  }
}

describe('MetraScheduleIndex.departuresAt', () => {
  it('returns a departure on a day the calendar covers', () => {
    // Only 2026-09-14 (a Monday) is in range, so neither neighboring day matches.
    const index = new MetraScheduleIndex(
      buildMetraSchedule(feed({ calendar: [calendarWindow('20260914', '20260914')] })),
    )
    const departures = index.departuresAt('Naperville', new Date('2026-09-14T10:00:00Z'))
    expect(departures).toHaveLength(1)
    expect(departures[0]).toMatchObject({
      route: 'BNSF', destination: 'Chicago Union Station', isScheduled: true, direction: '1',
    })
    // 07:00 Chicago time (CDT, UTC-5) on 2026-09-14.
    expect(departures[0].arrivalAt).toBe('2026-09-14T12:00:00.000Z')
  })

  it('finds nothing on a day the calendar excludes', () => {
    // 2026-09-13 is a Sunday; WEEKDAY service does not run, and 9/14 (Monday) is
    // excluded from the range so it cannot leak in from the day-after check.
    const index = new MetraScheduleIndex(
      buildMetraSchedule(feed({ calendar: [calendarWindow('20260101', '20260913')] })),
    )
    expect(index.departuresAt('Naperville', new Date('2026-09-13T10:00:00Z'))).toEqual([])
  })

  it('a calendar_dates addition (type 1) turns on an otherwise-inactive day', () => {
    const schedule = buildMetraSchedule(
      feed({
        calendar: [calendarWindow('20260101', '20260913')],
        calendarDates: [{ service_id: 'WEEKDAY', date: '20260913', exception_type: '1' }],
      }),
    )
    const index = new MetraScheduleIndex(schedule)
    expect(index.departuresAt('Naperville', new Date('2026-09-13T10:00:00Z'))).toHaveLength(1)
  })

  it('a calendar_dates removal (type 2) turns off an otherwise-active day', () => {
    const schedule = buildMetraSchedule(
      feed({
        calendar: [calendarWindow('20260914', '20260914')],
        calendarDates: [{ service_id: 'WEEKDAY', date: '20260914', exception_type: '2' }],
      }),
    )
    const index = new MetraScheduleIndex(schedule)
    expect(index.departuresAt('Naperville', new Date('2026-09-14T10:00:00Z'))).toEqual([])
  })

  it('a stop time past 24:00:00 lands on the following calendar day', () => {
    const schedule = buildMetraSchedule(
      feed({
        stopTimes: [
          { trip_id: 't1', stop_id: 'NAP', arrival_time: '25:10:00', stop_sequence: '1' },
          { trip_id: 't1', stop_id: 'CUS', arrival_time: '25:45:00', stop_sequence: '2' },
        ],
      }),
    )
    const index = new MetraScheduleIndex(schedule)
    // Service day 2026-09-14 (Monday), so 25:10 lands on the morning of the 15th.
    const departures = index.departuresAt('Naperville', new Date('2026-09-14T10:00:00Z'))
    expect(departures.map((d) => d.arrivalAt)).toContain('2026-09-15T06:10:00.000Z')
  })

  it('returns nothing for an unknown station', () => {
    const index = new MetraScheduleIndex(buildMetraSchedule(feed()))
    expect(index.departuresAt('Nowhere', new Date('2026-09-14T10:00:00Z'))).toEqual([])
  })
})

describe('MetraScheduleIndex.departuresAt realtime overlay', () => {
  // Only 2026-09-14 (a Monday) is in range, isolating exactly one scheduled
  // departure at Naperville: trip 't1', stop 'NAP', direction '1', 07:00 local.
  const index = new MetraScheduleIndex(
    buildMetraSchedule(feed({ calendar: [calendarWindow('20260914', '20260914')] })),
  )
  const now = new Date('2026-09-14T10:00:00Z')
  const realtimeFor = (delaySeconds: number | null, predictedAt: string | null = null, skipped = false) =>
    new Map([['t1', new Map([['NAP', { skipped, delaySeconds, predictedAt }]])]])

  it('shifts the arrival by the reported delay and flags it delayed', () => {
    const [departure] = index.departuresAt('Naperville', now, realtimeFor(300))
    expect(departure.isScheduled).toBe(false)
    expect(departure.isDelayed).toBe(true)
    // Scheduled 12:00:00Z + 300s.
    expect(departure.arrivalAt).toBe('2026-09-14T12:05:00.000Z')
  })

  it('a live but on-time trip is no longer "scheduled" and is not "delayed"', () => {
    const [departure] = index.departuresAt('Naperville', now, realtimeFor(0))
    expect(departure.isScheduled).toBe(false)
    expect(departure.isDelayed).toBe(false)
    expect(departure.arrivalAt).toBe('2026-09-14T12:00:00.000Z')
  })

  it('an absolute predicted time overrides the scheduled time directly', () => {
    const [departure] = index.departuresAt(
      'Naperville', now, realtimeFor(null, '2026-09-14T12:09:00.000Z'),
    )
    expect(departure.arrivalAt).toBe('2026-09-14T12:09:00.000Z')
    expect(departure.isDelayed).toBe(true)
  })

  it('drops a departure the realtime feed marks skipped', () => {
    expect(index.departuresAt('Naperville', now, realtimeFor(null, null, true))).toEqual([])
  })

  it('a delay under a minute does not count as delayed', () => {
    const [departure] = index.departuresAt('Naperville', now, realtimeFor(30))
    expect(departure.isDelayed).toBe(false)
  })

  it('falls back to the scheduled time when realtime has nothing for this trip', () => {
    const empty = new Map()
    const [departure] = index.departuresAt('Naperville', now, empty)
    expect(departure.isScheduled).toBe(true)
    expect(departure.isDelayed).toBe(false)
    expect(departure.arrivalAt).toBe('2026-09-14T12:00:00.000Z')
  })

  it('falls back to the scheduled time when realtime knows the trip but not this stop', () => {
    const otherStopOnly = new Map([['t1', new Map([['CUS', { skipped: false, delaySeconds: 300, predictedAt: null }]])]])
    const [departure] = index.departuresAt('Naperville', now, otherStopOnly)
    expect(departure.isScheduled).toBe(true)
  })

  it('with no realtime argument at all, behaves exactly as schedule-only', () => {
    const [departure] = index.departuresAt('Naperville', now)
    expect(departure.isScheduled).toBe(true)
  })
})

describe('loadMetraSchedule', () => {
  let dir: string
  const file = () => path.join(dir, 'metra-schedule.json')

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cta-metra-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('falls back to the bundled seed when no API key is configured', async () => {
    const loaded = await loadMetraSchedule(file(), '')
    expect(loaded.source).toBe('seed')
    expect(loaded.stations.length).toBeGreaterThan(0)
  })

  it('prefers a fresh cached copy over refetching, even without a key', async () => {
    const cached = {
      source: 'gtfs',
      fetchedAt: new Date().toISOString(),
      publishedVersion: 'v1',
      stations: [{ mapId: 'Cached', name: 'Cached', lines: ['BNSF'], stops: [] }],
      trips: [],
      calendar: {},
      exceptions: {},
    }
    await fs.writeFile(file(), JSON.stringify(cached), 'utf8')
    const loaded = await loadMetraSchedule(file(), '')
    expect(loaded.stations[0].name).toBe('Cached')
  })

  it('keeps a stale cached copy when the feed is unreachable', async () => {
    const stale = {
      source: 'gtfs',
      fetchedAt: new Date('2020-01-01').toISOString(),
      publishedVersion: 'v1',
      stations: [{ mapId: 'Stale', name: 'Stale', lines: ['BNSF'], stops: [] }],
      trips: [],
      calendar: {},
      exceptions: {},
    }
    await fs.writeFile(file(), JSON.stringify(stale), 'utf8')
    // A bogus key with no real network access exercises exactly the boot-time
    // failure path: the feed can't be reached, so the stale cache is kept.
    const loaded = await loadMetraSchedule(file(), 'not-a-real-key')
    expect(loaded.stations[0].name).toBe('Stale')
  })

  it('ignores an unreadable cache and still returns usable data', async () => {
    await fs.writeFile(file(), 'not json at all', 'utf8')
    expect((await loadMetraSchedule(file(), '')).stations.length).toBeGreaterThan(0)
  })
})
