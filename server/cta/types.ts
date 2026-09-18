import type { BusRoute, BusStop, Departure } from '../../shared/types.ts'

/**
 * The seam between the dashboard and the CTA. The live and mock implementations
 * satisfy the same interface, so every layer above this file — routes, digest,
 * UI — is identical in both modes and testable without network access.
 */
export interface CtaProvider {
  /** All arrivals at a station, both directions, every line that serves it. */
  trainArrivals(mapId: string): Promise<Departure[]>
  /** Predictions for up to 10 stops in one upstream call. */
  busPredictions(stopIds: string[]): Promise<Departure[]>
  busRoutes(): Promise<BusRoute[]>
  busDirections(route: string): Promise<string[]>
  busStops(route: string, direction: string): Promise<BusStop[]>
  /** Scheduled departures at a Metra station, both directions, every line. */
  metraArrivals(mapId: string): Promise<Departure[]>
}

/** Upstream failure with a message safe to show in a card. */
export class CtaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CtaError'
  }
}
