/**
 * Metra schedule reference data, built from the GTFS static feed.
 *
 * Metra's realtime API reports delays, but this dashboard deliberately shows
 * only scheduled times for Metra (see the card picker copy) — Metra service is
 * reliable enough that the added complexity of a second, delay-aware code path
 * is not worth it yet. So the only Metra data this file needs from GTFS is the
 * schedule: which lines call at which stations, in which direction, and at
 * what time of day, on which days.
 *
 * A GTFS stop_id is a physical platform, not a direction — unlike the CTA
 * where a stop_id is already one-directional. To keep the card picker's
 * line -> station -> direction flow identical to trains, each (stop_id,
 * direction_id) pair is treated as its own "stop" here, with a synthetic id
 * of `${stop_id}:${direction_id}`.
 *
 * Metra also publishes GTFS-realtime feeds (protobuf, same METRA_API_KEY)
 * that this dashboard does not use yet, for the delay-free reason above:
 *   https://gtfspublic.metrarr.com/gtfs/public/alerts
 *   https://gtfspublic.metrarr.com/gtfs/public/positions
 *   https://gtfspublic.metrarr.com/gtfs/public/tripupdates
 * `alerts` in particular (service disruptions, not per-train delays) would be
 * a natural, low-complexity first use if that changes.
 */

import type { Station, StationStop, Departure } from '../../shared/types.ts'
import { normalizeMetraLineId, type MetraLineId } from '../../shared/metraLines.ts'
import { CHICAGO, weekday, wallClockToInstant, zonedParts } from '../../shared/time.ts'
import { fetchGtfsFeed, fetchPublishedVersion, type GtfsFeed } from './gtfs.ts'
import { SEED_METRA_SCHEDULE } from './seed.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

export type MetraTrip = {
  routeId: MetraLineId
  serviceId: string
  directionId: '0' | '1'
  headsign: string
  /** Sorted by GTFS stop_sequence. */
  stops: { platformId: string; seconds: number }[]
}

type CalendarEntry = { days: boolean[]; startDate: string; endDate: string }

export type MetraScheduleFile = {
  source: 'gtfs' | 'seed'
  fetchedAt: string | null
  /** The `published.txt` build id this schedule was parsed from, if known. */
  publishedVersion: string | null
  stations: Station[]
  trips: MetraTrip[]
  calendar: Record<string, CalendarEntry>
  /** service_id -> 'YYYYMMDD' -> 1 (added) | 2 (removed). */
  exceptions: Record<string, Record<string, 1 | 2>>
}

/**
 * Metra's published GTFS static schedule feed. If Metra changes these paths,
 * this is the one place to update them.
 */
const SCHEDULE_URL = 'https://schedules.metrarail.com/gtfs/schedule.zip'
/** A small text file identifying the current schedule build; see `fetchPublishedVersion`. */
const PUBLISHED_URL = 'https://schedules.metrarail.com/gtfs/published.txt'

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const CALENDAR_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function parseGtfsTime(value: string): number | null {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

function bestHeadsign(headsigns: Map<string, number>): string {
  let best = ''
  let bestCount = 0
  for (const [headsign, count] of headsigns) {
    if (headsign && count > bestCount) {
      best = headsign
      bestCount = count
    }
  }
  return best
}

/** Exported for tests: turns a parsed GTFS feed into our compact schedule shape. */
export function buildMetraSchedule(feed: GtfsFeed): MetraScheduleFile {
  const stopNames = new Map<string, string>()
  for (const row of feed.stops) {
    const id = row.stop_id?.trim()
    if (id) stopNames.set(id, row.stop_name?.trim() || id)
  }

  const calendar: MetraScheduleFile['calendar'] = {}
  for (const row of feed.calendar) {
    const id = row.service_id?.trim()
    if (!id) continue
    calendar[id] = {
      days: CALENDAR_DAYS.map((day) => row[day] === '1'),
      startDate: row.start_date?.trim() ?? '',
      endDate: row.end_date?.trim() ?? '',
    }
  }

  const exceptions: MetraScheduleFile['exceptions'] = {}
  for (const row of feed.calendarDates) {
    const id = row.service_id?.trim()
    const date = row.date?.trim()
    const type = row.exception_type?.trim()
    if (!id || !date || (type !== '1' && type !== '2')) continue
    ;(exceptions[id] ??= {})[date] = type === '1' ? 1 : 2
  }

  const routeLines = new Map<string, MetraLineId>()
  for (const row of feed.routes) {
    const id = row.route_id?.trim()
    const line = id ? normalizeMetraLineId(id) : null
    if (id && line) routeLines.set(id, line)
  }

  type TripMeta = { routeId: MetraLineId; serviceId: string; directionId: '0' | '1'; headsign: string }
  const tripMeta = new Map<string, TripMeta>()
  for (const row of feed.trips) {
    const tripId = row.trip_id?.trim()
    const routeId = row.route_id?.trim()
    const line = routeId ? routeLines.get(routeId) : undefined
    if (!tripId || !line) continue
    tripMeta.set(tripId, {
      routeId: line,
      serviceId: row.service_id?.trim() ?? '',
      directionId: row.direction_id?.trim() === '1' ? '1' : '0',
      headsign: row.trip_headsign?.trim() ?? '',
    })
  }

  const stopTimesByTrip = new Map<string, { stopId: string; sequence: number; seconds: number }[]>()
  for (const row of feed.stopTimes) {
    const tripId = row.trip_id?.trim()
    if (!tripId || !tripMeta.has(tripId)) continue
    const stopId = row.stop_id?.trim()
    const seconds = parseGtfsTime(row.arrival_time || row.departure_time || '')
    if (!stopId || seconds === null) continue
    const list = stopTimesByTrip.get(tripId) ?? []
    list.push({ stopId, sequence: Number(row.stop_sequence ?? '0') || 0, seconds })
    stopTimesByTrip.set(tripId, list)
  }

  const trips: MetraTrip[] = []
  const platforms = new Map<
    string,
    { stopId: string; directionId: '0' | '1'; lines: Set<MetraLineId>; headsigns: Map<string, number> }
  >()

  for (const [tripId, meta] of tripMeta) {
    const stopTimes = stopTimesByTrip.get(tripId)
    if (!stopTimes || stopTimes.length === 0) continue
    stopTimes.sort((a, b) => a.sequence - b.sequence)

    const stops = stopTimes.map(({ stopId, seconds }) => {
      const platformId = `${stopId}:${meta.directionId}`
      let platform = platforms.get(platformId)
      if (!platform) {
        platform = { stopId, directionId: meta.directionId, lines: new Set(), headsigns: new Map() }
        platforms.set(platformId, platform)
      }
      platform.lines.add(meta.routeId)
      platform.headsigns.set(meta.headsign, (platform.headsigns.get(meta.headsign) ?? 0) + 1)
      return { platformId, seconds }
    })

    trips.push({
      routeId: meta.routeId,
      serviceId: meta.serviceId,
      directionId: meta.directionId,
      headsign: meta.headsign,
      stops,
    })
  }

  const byName = new Map<string, Station>()
  for (const platform of platforms.values()) {
    const name = stopNames.get(platform.stopId) ?? platform.stopId
    let station = byName.get(name)
    if (!station) {
      station = { mapId: name, name, lines: [], stops: [] }
      byName.set(name, station)
    }
    const lines = [...platform.lines].sort()
    for (const line of lines) if (!station.lines.includes(line)) station.lines.push(line)
    const headsign = bestHeadsign(platform.headsigns)
    const label = headsign ? `${headsign}-bound` : platform.directionId === '1' ? 'Inbound' : 'Outbound'
    const stop: StationStop = { stopId: `${platform.stopId}:${platform.directionId}`, direction: platform.directionId, label, lines }
    station.stops.push(stop)
  }

  for (const station of byName.values()) {
    station.lines.sort()
    station.stops.sort((a, b) => a.label.localeCompare(b.label))
  }

  return {
    source: 'gtfs',
    fetchedAt: new Date().toISOString(),
    publishedVersion: null,
    stations: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    trips,
    calendar,
    exceptions,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

async function readCached(filePath: string): Promise<MetraScheduleFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<MetraScheduleFile>
    if (!Array.isArray(parsed.stations) || !Array.isArray(parsed.trips)) return null
    return {
      source: parsed.source === 'gtfs' ? 'gtfs' : 'seed',
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
      publishedVersion: typeof parsed.publishedVersion === 'string' ? parsed.publishedVersion : null,
      stations: parsed.stations as Station[],
      trips: parsed.trips as MetraTrip[],
      calendar: parsed.calendar ?? {},
      exceptions: parsed.exceptions ?? {},
    }
  } catch {
    return null
  }
}

async function writeCache(filePath: string, file: MetraScheduleFile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  await fs.rename(temp, filePath)
}

function isStale(file: MetraScheduleFile, now: Date): boolean {
  if (file.source !== 'gtfs' || !file.fetchedAt) return true
  return now.getTime() - new Date(file.fetchedAt).getTime() > MAX_AGE_MS
}

/**
 * Resolve the Metra schedule, refreshing from the GTFS feed when the cached
 * copy is missing or stale. Never throws: a failure degrades to whatever is
 * already cached, or to the seed.
 *
 * Before re-downloading the (multi-megabyte) schedule zip, this checks Metra's
 * `published.txt` — if it still names the build the cache was parsed from,
 * nothing has changed upstream and only the cache's timestamp is bumped.
 */
export async function loadMetraSchedule(
  filePath: string,
  apiKey: string,
  { force = false, now = new Date() } = {},
): Promise<MetraScheduleFile> {
  const cached = await readCached(filePath)
  if (cached && !force && !isStale(cached, now)) return cached

  if (!apiKey) {
    if (cached) return cached
    console.warn('[metra] METRA_API_KEY is not set; using the bundled seed schedule.')
    return SEED_METRA_SCHEDULE
  }

  try {
    const publishedVersion = await fetchPublishedVersion(PUBLISHED_URL, apiKey).catch(() => null)
    if (publishedVersion && cached?.source === 'gtfs' && cached.publishedVersion === publishedVersion) {
      const unchanged: MetraScheduleFile = { ...cached, fetchedAt: now.toISOString() }
      await writeCache(filePath, unchanged)
      console.log(`[metra] schedule unchanged (published.txt still "${publishedVersion}")`)
      return unchanged
    }

    const fresh: MetraScheduleFile = {
      ...buildMetraSchedule(await fetchGtfsFeed(SCHEDULE_URL, apiKey)),
      publishedVersion,
    }
    if (fresh.stations.length === 0) throw new Error('GTFS feed returned no stations')
    await writeCache(filePath, fresh)
    console.log(`[metra] refreshed ${fresh.stations.length} stations from the GTFS feed`)
    return fresh
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (cached) {
      console.warn(`[metra] schedule refresh failed (${reason}); using the cached copy`)
      return cached
    }
    console.warn(
      `[metra] schedule refresh failed (${reason}); falling back to the bundled seed. ` +
        'The Metra picker will only offer a few stations until this succeeds.',
    )
    return SEED_METRA_SCHEDULE
  }
}

/** Lookup and departure-computation helpers over a loaded Metra schedule. */
export class MetraScheduleIndex {
  #byMapId: Map<string, Station>
  readonly file: MetraScheduleFile

  constructor(file: MetraScheduleFile) {
    this.file = file
    this.#byMapId = new Map(file.stations.map((s) => [s.mapId, s]))
  }

  get stations(): Station[] {
    return this.file.stations
  }

  get isSeed(): boolean {
    return this.file.source === 'seed'
  }

  byMapId(mapId: string): Station | undefined {
    return this.#byMapId.get(mapId)
  }

  byLine(lineId: string): Station[] {
    return this.file.stations.filter((s) => s.lines.includes(lineId))
  }

  stopsForLine(mapId: string, lineId: string): StationStop[] {
    return this.#byMapId.get(mapId)?.stops.filter((s) => s.lines.includes(lineId)) ?? []
  }

  #isServiceActive(serviceId: string, dateKey: string, weekdayIndex: number): boolean {
    const exception = this.file.exceptions[serviceId]?.[dateKey]
    if (exception === 1) return true
    if (exception === 2) return false
    const entry = this.file.calendar[serviceId]
    if (!entry) return false
    if (dateKey < entry.startDate || dateKey > entry.endDate) return false
    return entry.days[weekdayIndex] ?? false
  }

  /**
   * Every scheduled departure at a station, every line and direction. Looks a
   * day either side of `now` so a trip whose GTFS time crosses midnight (an
   * owl trip still running on yesterday's service day, or tomorrow's first
   * departure) is not missed; callers prune anything not actually upcoming.
   */
  departuresAt(mapId: string, now: Date): Departure[] {
    const station = this.#byMapId.get(mapId)
    if (!station) return []
    const platformIds = new Set(station.stops.map((s) => s.stopId))
    const departures: Departure[] = []

    for (const dayOffset of [-1, 0, 1]) {
      const base = new Date(now.getTime() + dayOffset * 86_400_000)
      const parts = zonedParts(base, CHICAGO)
      const dateKey = `${parts.year}${pad(parts.month)}${pad(parts.day)}`
      const weekdayIndex = weekday(base, CHICAGO)

      for (const trip of this.file.trips) {
        if (!this.#isServiceActive(trip.serviceId, dateKey, weekdayIndex)) continue
        for (const stop of trip.stops) {
          if (!platformIds.has(stop.platformId)) continue
          const arrivalAt = wallClockToInstant(
            {
              year: parts.year,
              month: parts.month,
              day: parts.day,
              hour: Math.floor(stop.seconds / 3600),
              minute: Math.floor(stop.seconds / 60) % 60,
              second: stop.seconds % 60,
            },
            CHICAGO,
          )
          departures.push({
            route: trip.routeId,
            destination: trip.headsign || 'Scheduled',
            arrivalAt: arrivalAt.toISOString(),
            isApproaching: false,
            isDelayed: false,
            isScheduled: true,
            stopId: stop.platformId,
            direction: trip.directionId,
          })
        }
      }
    }
    return departures
  }
}
