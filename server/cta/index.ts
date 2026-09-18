/** Provider selection: one switch, everything above this line is unaffected. */

import type { Env } from '../env.ts'
import type { StationIndex } from '../stations/index.ts'
import type { MetraScheduleIndex } from '../metra/schedule.ts'
import { getMetraRealtimeIndex } from '../metra/realtime.ts'
import type { CtaProvider } from './types.ts'
import { createMockProvider } from './mock.ts'
import { fetchTrainArrivals } from './train.ts'
import {
  fetchBusDirections,
  fetchBusPredictions,
  fetchBusRoutes,
  fetchBusStops,
} from './bus.ts'

export function createProvider(
  env: Env,
  stations: () => StationIndex,
  metraStations: () => MetraScheduleIndex,
): CtaProvider {
  if (env.mock) return createMockProvider(stations, metraStations)
  return {
    trainArrivals: (mapId) => fetchTrainArrivals(env.trainApiKey, mapId),
    busPredictions: (stopIds) => fetchBusPredictions(env.busApiKey, stopIds),
    busRoutes: () => fetchBusRoutes(env.busApiKey),
    busDirections: (route) => fetchBusDirections(env.busApiKey, route),
    busStops: (route, direction) => fetchBusStops(env.busApiKey, route, direction),
    // Scheduled times come from the already-loaded GTFS schedule; the realtime
    // feed (fetched and cached separately, see server/metra/realtime.ts) then
    // overlays live delays on top where it has them.
    metraArrivals: async (mapId) => {
      const realtime = await getMetraRealtimeIndex(env.metraApiKey)
      return metraStations().departuresAt(mapId, new Date(), realtime)
    },
  }
}

export type { CtaProvider } from './types.ts'
export { CtaError } from './types.ts'
