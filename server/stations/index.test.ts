import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { normalizeStations, stopLabel, loadStations, StationIndex } from './index.ts'

const row = (over: Record<string, unknown> = {}) => ({
  map_id: '41320',
  station_name: 'Western',
  stop_id: '30226',
  direction_id: 'S',
  stop_name: 'Western (Loop-bound)',
  brn: true,
  ...over,
})

describe('stopLabel', () => {
  it('extracts the direction phrase the CTA puts in parentheses', () => {
    expect(stopLabel('Western (Loop-bound)', 'S')).toBe('Loop-bound')
    expect(stopLabel("Clark/Lake (O'Hare-bound)", 'E')).toBe("O'Hare-bound")
  })

  it('falls back to a readable compass direction', () => {
    expect(stopLabel('Western', 'N')).toBe('Northbound')
  })

  it('falls back to the raw direction when even that is unknown', () => {
    expect(stopLabel('Western', 'XX')).toBe('XX')
  })
})

describe('normalizeStations', () => {
  it('folds the two directional rows into one station', () => {
    const stations = normalizeStations([
      row(),
      row({ stop_id: '30225', direction_id: 'N', stop_name: 'Western (Kimball-bound)' }),
    ])
    expect(stations).toHaveLength(1)
    expect(stations[0].stops.map((s) => s.label)).toEqual(['Kimball-bound', 'Loop-bound'])
  })

  it('collects every line serving a station', () => {
    const stations = normalizeStations([
      row({ map_id: '40380', station_name: 'Clark/Lake', stop_id: '30374', brn: true, p: true }),
      row({ map_id: '40380', station_name: 'Clark/Lake', stop_id: '30375', brn: false, g: true, org: true }),
    ])
    expect(stations[0].lines).toEqual(['Brn', 'G', 'Org', 'P'])
  })

  it('maps Purple Express onto the Purple line rather than inventing one', () => {
    expect(normalizeStations([row({ brn: false, pexp: true })])[0].lines).toEqual(['P'])
  })

  it('ignores a false line flag', () => {
    expect(normalizeStations([row({ brn: true, red: false })])[0].lines).toEqual(['Brn'])
  })

  it('skips rows with no map or stop id', () => {
    expect(normalizeStations([row({ map_id: '' }), row({ stop_id: '' })])).toEqual([])
  })

  it('deduplicates a repeated stop id', () => {
    expect(normalizeStations([row(), row()])[0].stops).toHaveLength(1)
  })

  it('returns empty for a non-array payload', () => {
    expect(normalizeStations({ nope: true })).toEqual([])
    expect(normalizeStations(null)).toEqual([])
  })
})

describe('loadStations', () => {
  let dir: string
  const file = () => path.join(dir, 'stations.json')

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cta-stations-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('falls back to the bundled seed when the portal is unreachable', async () => {
    // No cached file and no egress: this is exactly the first-boot failure path.
    const loaded = await loadStations(file())
    expect(loaded.source).toBe('seed')
    expect(loaded.stations.length).toBeGreaterThan(0)
  })

  it('prefers a fresh cached copy over refetching', async () => {
    const cached = {
      source: 'portal',
      fetchedAt: new Date().toISOString(),
      stations: [{ mapId: '1', name: 'Cached', lines: ['Red'], stops: [] }],
    }
    await fs.writeFile(file(), JSON.stringify(cached), 'utf8')
    const loaded = await loadStations(file())
    expect(loaded.stations[0].name).toBe('Cached')
  })

  it('keeps a stale cached copy when the refresh fails', async () => {
    const stale = {
      source: 'portal',
      fetchedAt: new Date('2020-01-01').toISOString(),
      stations: [{ mapId: '1', name: 'Stale', lines: ['Red'], stops: [] }],
    }
    await fs.writeFile(file(), JSON.stringify(stale), 'utf8')
    const loaded = await loadStations(file())
    expect(loaded.stations[0].name).toBe('Stale')
  })

  it('ignores an unreadable cache and still returns usable data', async () => {
    await fs.writeFile(file(), 'not json at all', 'utf8')
    expect((await loadStations(file())).stations.length).toBeGreaterThan(0)
  })
})

describe('StationIndex', () => {
  const index = new StationIndex({
    source: 'seed',
    fetchedAt: null,
    stations: normalizeStations([
      row(),
      row({ stop_id: '30225', direction_id: 'N', stop_name: 'Western (Kimball-bound)' }),
      row({ map_id: '41660', station_name: 'Lake', stop_id: '30050', brn: false, red: true }),
    ]),
  })

  it('looks a station up by map id', () => {
    expect(index.byMapId('41320')?.name).toBe('Western')
    expect(index.byMapId('nope')).toBeUndefined()
  })

  it('filters stations by line', () => {
    expect(index.byLine('Brn').map((s) => s.name)).toEqual(['Western'])
    expect(index.byLine('Red').map((s) => s.name)).toEqual(['Lake'])
  })

  it('resolves a single stop', () => {
    expect(index.stop('41320', '30225')?.label).toBe('Kimball-bound')
  })

  it('reports seed data so callers can warn about it', () => {
    expect(index.isSeed).toBe(true)
  })
})
