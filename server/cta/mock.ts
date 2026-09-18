/**
 * Fixture provider. Same interface as the live one, so every layer above it
 * behaves identically in mock mode — which is what makes the UI, the layouts and
 * the digest testable without CTA keys or network access.
 *
 * Times advance with the clock so the dashboard visibly refreshes, but are
 * derived from the stop id rather than random, so repeated calls within the same
 * minute agree and tests stay deterministic.
 */

import type { BusRoute, BusStop, Departure } from '../../shared/types.ts'
import type { CtaProvider } from './types.ts'
import type { StationIndex } from '../stations/index.ts'
import type { MetraScheduleIndex } from '../metra/schedule.ts'

const TRAIN_DESTINATIONS: Record<string, Record<string, string>> = {
  Red: { N: 'Howard', S: '95th/Dan Ryan' },
  Blue: { E: "O'Hare", W: 'Forest Park', N: "O'Hare", S: 'Forest Park' },
  Brn: { N: 'Kimball', S: 'Loop' },
  G: { N: 'Harlem/Lake', S: 'Ashland/63rd', E: 'Harlem/Lake', W: 'Ashland/63rd' },
  Org: { N: 'Loop', S: 'Midway' },
  P: { N: 'Linden', S: 'Loop' },
  Pink: { N: 'Loop', S: '54th/Cermak', E: 'Loop', W: '54th/Cermak' },
  Y: { N: 'Skokie', S: 'Howard' },
}

const BUS_ROUTES: BusRoute[] = [
  { route: '49', name: 'Western' },
  { route: '22', name: 'Clark' },
  { route: '66', name: 'Chicago' },
  { route: '77', name: 'Belmont' },
  { route: 'X49', name: 'Western Express' },
]

const BUS_DIRECTIONS: Record<string, string[]> = {
  '49': ['Northbound', 'Southbound'],
  X49: ['Northbound', 'Southbound'],
  '22': ['Northbound', 'Southbound'],
  '66': ['Eastbound', 'Westbound'],
  '77': ['Eastbound', 'Westbound'],
}

const BUS_DESTINATIONS: Record<string, Record<string, string>> = {
  '49': { Northbound: 'Berwyn', Southbound: '79th' },
  X49: { Northbound: 'Berwyn', Southbound: '79th' },
  '22': { Northbound: 'Howard', Southbound: 'Harrison' },
  '66': { Eastbound: 'Navy Pier', Westbound: 'Austin' },
  '77': { Eastbound: 'Broadway', Westbound: 'Harlem' },
}

/** Small stable hash so a given stop always produces the same headway pattern. */
function seedOf(value: string): number {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return hash
}

/**
 * Departure offsets that tick down in real time: the pattern is anchored to
 * absolute time, so a card polled 30s later shows 30s less.
 */
function offsetsFor(stopId: string, now: Date, headway: number, count: number): number[] {
  const seed = seedOf(stopId)
  const phase = (seed % (headway * 60)) * 1000
  const anchor = Math.floor((now.getTime() + phase) / (headway * 60_000)) * headway * 60_000 - phase
  const offsets: number[] = []
  for (let i = 0; i < count + 1; i += 1) {
    // Alternate slightly around the headway so arrivals do not look metronomic.
    const drift = ((seed + i * 7) % 5) - 2
    const at = anchor + (i * headway + drift) * 60_000
    if (at > now.getTime() - 30_000) offsets.push(at)
  }
  return offsets.slice(0, count)
}

export function createMockProvider(
  stations: () => StationIndex,
  metraStations: () => MetraScheduleIndex,
): CtaProvider {
  return {
    async trainArrivals(mapId: string): Promise<Departure[]> {
      const station = stations().byMapId(mapId)
      if (!station) return []
      const now = new Date()
      const departures: Departure[] = []

      for (const stop of station.stops) {
        for (const line of station.lines) {
          const destination =
            TRAIN_DESTINATIONS[line]?.[stop.direction] ?? stop.label.replace(/-bound$/, '')
          for (const at of offsetsFor(`${line}${stop.stopId}`, now, 8, 3)) {
            departures.push({
              route: line,
              destination,
              arrivalAt: new Date(at).toISOString(),
              isApproaching: at - now.getTime() < 60_000,
              isDelayed: seedOf(stop.stopId + line) % 17 === 0,
              isScheduled: false,
              stopId: stop.stopId,
              direction: stop.direction,
            })
          }
        }
      }
      return departures
    },

    async busPredictions(stopIds: string[]): Promise<Departure[]> {
      const now = new Date()
      const departures: Departure[] = []
      for (const stopId of stopIds) {
        const [route = '49', direction = 'Northbound'] = stopId.split(':').slice(1)
        for (const at of offsetsFor(stopId, now, 11, 3)) {
          departures.push({
            route,
            destination: BUS_DESTINATIONS[route]?.[direction] ?? 'Terminal',
            arrivalAt: new Date(at).toISOString(),
            isApproaching: at - now.getTime() < 60_000,
            isDelayed: false,
            isScheduled: false,
            stopId,
            direction,
          })
        }
      }
      return departures
    },

    async busRoutes(): Promise<BusRoute[]> {
      return BUS_ROUTES
    },

    async busDirections(route: string): Promise<string[]> {
      return BUS_DIRECTIONS[route] ?? ['Northbound', 'Southbound']
    },

    async metraArrivals(mapId: string): Promise<Departure[]> {
      const now = new Date()
      const scheduled = metraStations().departuresAt(mapId, now)
      // A real GTFS-realtime feed only tracks a trip once it is close to
      // running, so this leaves anything further out as plain schedule and
      // only overlays a synthetic live status -- on time, or a few minutes
      // late -- on the near-term departures, the same mix Metra's own feed
      // produces.
      return scheduled.map((departure) => {
        const minutesOut = (new Date(departure.arrivalAt).getTime() - now.getTime()) / 60_000
        if (minutesOut > 90) return departure
        const seed = seedOf(departure.stopId + departure.route + departure.arrivalAt)
        if (seed % 5 !== 0) return { ...departure, isScheduled: false, isDelayed: false }
        const delayMinutes = 2 + (seed % 10)
        return {
          ...departure,
          arrivalAt: new Date(new Date(departure.arrivalAt).getTime() + delayMinutes * 60_000).toISOString(),
          isScheduled: false,
          isDelayed: true,
        }
      })
    },

    async busStops(route: string, direction: string): Promise<BusStop[]> {
      const cross = ['Armitage', 'Belmont', 'Chicago', 'Diversey', 'Fullerton', 'Irving Park']
      const name = BUS_ROUTES.find((r) => r.route === route)?.name ?? route
      // Stop ids encode route and direction so busPredictions can answer from the
      // id alone, matching the real API where a stop id is direction-specific.
      return cross.map((street) => ({
        stopId: `mock${seedOf(route + direction + street)}:${route}:${direction}`,
        name: `${name} & ${street}`,
      }))
    },
  }
}
