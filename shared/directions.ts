/**
 * Direction choices for a station platform list.
 *
 * Two platforms can share a direction once labels are normalized — the Loop
 * elevated tracks are both 'Loop-bound' — so the choice a rider picks is the
 * label, and it carries every stop id that answers to it.
 */

import type { StationStop } from './types.ts'

export type DirectionOption = {
  label: string
  stopIds: string[]
}

/** Unique directions, in the order the platforms are listed. */
export function directionOptions(stops: StationStop[]): DirectionOption[] {
  const byLabel = new Map<string, string[]>()
  for (const stop of stops) {
    const ids = byLabel.get(stop.label)
    if (ids) ids.push(stop.stopId)
    else byLabel.set(stop.label, [stop.stopId])
  }
  return [...byLabel].map(([label, stopIds]) => ({ label, stopIds }))
}
