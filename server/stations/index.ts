/**
 * 'L' station reference data.
 *
 * The Train Tracker API has no "list all stations" endpoint, so the card picker
 * needs the City of Chicago's List of 'L' Stops dataset. It also supplies the
 * per-direction stop pairs that give each card its direction choices
 * ('Loop-bound' / 'Kimball-bound' / Both).
 *
 * On boot we refresh it into the data volume if missing or stale, and fall back
 * to a committed seed on any failure. The build therefore never needs network,
 * and a portal outage degrades the picker instead of breaking the container.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { Station, StationStop } from '../../shared/types.ts'
import { SEED_STATION_ROWS } from './seed.ts'

const DATASET_URL = 'https://data.cityofchicago.org/resource/8pix-ypme.json?$limit=1000'
const FETCH_TIMEOUT_MS = 20_000
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type StationFile = {
  /** 'portal' once real data has been fetched; 'seed' until then. */
  source: 'portal' | 'seed'
  fetchedAt: string | null
  stations: Station[]
}

/** Dataset column -> our line id. Purple Express shares the Purple line. */
const LINE_COLUMNS: Record<string, string> = {
  red: 'Red', blue: 'Blue', brn: 'Brn', g: 'G',
  org: 'Org', o: 'Org', p: 'P', pexp: 'P', pnk: 'Pink', pink: 'Pink', y: 'Y',
}

/**
 * Dataset wording -> the direction CTA actually publishes, keyed in lower case.
 *
 * The city dataset names the two Loop elevated tracks 'Inner Loop' and 'Outer
 * Loop', which is track geography, not a direction any rider sees: CTA calls
 * both of them Loop service, so both normalize to 'Loop-bound'. Two platforms
 * folding onto one label is expected, and callers merge them into a single
 * choice that watches both stop ids.
 */
const DIRECTION_ALIASES: Record<string, string> = {
  'inner loop': 'Loop-bound',
  'outer loop': 'Loop-bound',
  'loop bound': 'Loop-bound',
  // Abbreviations the dataset uses and CTA spells out.
  'forest pk-bound': 'Forest Park-bound',
  'midway bound': 'Midway-bound',
}

/** Folds dataset phrasing onto CTA's own direction wording. */
export function normalizeDirectionLabel(label: string): string {
  const cleaned = label.trim().replace(/\s+/g, ' ')
  return DIRECTION_ALIASES[cleaned.toLowerCase()] ?? cleaned
}

/** 'Western (Loop-bound)' -> 'Loop-bound'; falls back to the compass direction. */
export function stopLabel(stopName: string, direction: string): string {
  const match = /\(([^)]+)\)\s*$/.exec(stopName.trim())
  if (match) return normalizeDirectionLabel(match[1])
  // The compass words match the directions Bus Tracker reports, so a bus card
  // and a train card without a parenthetical read the same way.
  return { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound' }[direction] ?? direction
}

/** Exported for tests: folds raw dataset rows into one entry per station. */
export function normalizeStations(rows: unknown): Station[] {
  if (!Array.isArray(rows)) return []
  const byMapId = new Map<string, Station>()

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null) continue
    const row = raw as Record<string, unknown>
    const mapId = String(row.map_id ?? '').trim()
    const stopId = String(row.stop_id ?? '').trim()
    if (!mapId || !stopId) continue

    let station = byMapId.get(mapId)
    if (!station) {
      station = {
        mapId,
        name: String(row.station_name ?? '').trim() || mapId,
        lines: [],
        stops: [],
      }
      byMapId.set(mapId, station)
    }

    const stopLines: string[] = []
    for (const [column, lineId] of Object.entries(LINE_COLUMNS)) {
      if (row[column] === true && !stopLines.includes(lineId)) stopLines.push(lineId)
    }
    for (const lineId of stopLines) {
      if (!station.lines.includes(lineId)) station.lines.push(lineId)
    }

    const existing = station.stops.find((s) => s.stopId === stopId)
    if (existing) {
      for (const lineId of stopLines) {
        if (!existing.lines.includes(lineId)) existing.lines.push(lineId)
      }
    } else {
      const direction = String(row.direction_id ?? '').trim()
      station.stops.push({
        stopId,
        direction,
        label: stopLabel(String(row.stop_name ?? ''), direction),
        lines: stopLines,
      })
    }
  }

  for (const station of byMapId.values()) {
    station.lines.sort()
    for (const stop of station.stops) stop.lines.sort()
    station.stops.sort((a, b) => a.label.localeCompare(b.label))
  }
  return [...byMapId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function readSeed(): StationFile {
  return { source: 'seed', fetchedAt: null, stations: normalizeStations(SEED_STATION_ROWS) }
}

async function readCached(filePath: string): Promise<StationFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<StationFile>
    if (!Array.isArray(parsed.stations) || parsed.stations.length === 0) return null
    return {
      source: parsed.source === 'portal' ? 'portal' : 'seed',
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
      // Labels are normalized again on read, not just on fetch: a copy cached
      // before the alias table existed would otherwise keep its raw wording
      // for up to a month.
      stations: (parsed.stations as Station[]).map((station) => ({
        ...station,
        stops: station.stops.map((stop) => ({
          ...stop,
          label: normalizeDirectionLabel(stop.label),
        })),
      })),
    }
  } catch {
    return null
  }
}

function isStale(file: StationFile, now: Date): boolean {
  if (file.source !== 'portal' || !file.fetchedAt) return true
  return now.getTime() - new Date(file.fetchedAt).getTime() > MAX_AGE_MS
}

async function fetchFromPortal(): Promise<StationFile> {
  const response = await fetch(DATASET_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`data portal returned HTTP ${response.status}`)
  const stations = normalizeStations(await response.json())
  if (stations.length === 0) throw new Error('data portal returned no stations')
  return { source: 'portal', fetchedAt: new Date().toISOString(), stations }
}

/**
 * Resolve the station list, refreshing from the portal when the cached copy is
 * missing or stale. Never throws: a failure downgrades to whatever we already
 * have, or to the seed.
 */
export async function loadStations(
  filePath: string,
  { force = false, now = new Date() } = {},
): Promise<StationFile> {
  const cached = await readCached(filePath)
  if (cached && !force && !isStale(cached, now)) return cached

  try {
    const fresh = await fetchFromPortal()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const temp = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(temp, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8')
    await fs.rename(temp, filePath)
    console.log(`[stations] refreshed ${fresh.stations.length} stations from the data portal`)
    return fresh
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (cached) {
      console.warn(`[stations] refresh failed (${reason}); using the cached copy`)
      return cached
    }
    console.warn(
      `[stations] refresh failed (${reason}); falling back to the bundled seed. ` +
        'The station picker will only offer a few stations until this succeeds.',
    )
    return readSeed()
  }
}

/** Lookup helpers over a loaded station list. */
export class StationIndex {
  #byMapId: Map<string, Station>
  readonly file: StationFile

  constructor(file: StationFile) {
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

  /** Stations served by a given line, for the picker's second step. */
  byLine(lineId: string): Station[] {
    return this.file.stations.filter((s) => s.lines.includes(lineId))
  }

  stop(mapId: string, stopId: string): StationStop | undefined {
    return this.#byMapId.get(mapId)?.stops.find((s) => s.stopId === stopId)
  }

  /** Only the platforms a given line actually calls at. */
  stopsForLine(mapId: string, lineId: string): StationStop[] {
    return this.#byMapId.get(mapId)?.stops.filter((s) => s.lines.includes(lineId)) ?? []
  }
}
