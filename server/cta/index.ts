/** Provider selection: one switch, everything above this line is unaffected. */

import type { Env } from '../env.ts'
import type { StationIndex } from '../stations/index.ts'
import type { CtaProvider } from './types.ts'
import { createMockProvider } from './mock.ts'
import { fetchTrainArrivals } from './train.ts'
import {
  fetchBusDirections,
  fetchBusPredictions,
  fetchBusRoutes,
  fetchBusStops,
} from './bus.ts'

export function createProvider(env: Env, stations: () => StationIndex): CtaProvider {
  if (env.mock) return createMockProvider(stations)
  return {
    trainArrivals: (mapId) => fetchTrainArrivals(env.trainApiKey, mapId),
    busPredictions: (stopIds) => fetchBusPredictions(env.busApiKey, stopIds),
    busRoutes: () => fetchBusRoutes(env.busApiKey),
    busDirections: (route) => fetchBusDirections(env.busApiKey, route),
    busStops: (route, direction) => fetchBusStops(env.busApiKey, route, direction),
  }
}

export type { CtaProvider } from './types.ts'
export { CtaError } from './types.ts'
