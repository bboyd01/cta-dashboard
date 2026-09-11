/**
 * Departure rendering. The single source of truth for "7 min" vs "6:42 PM",
 * used by the React cards and by the Discord digest so the two can never drift.
 */

import type { Departure, TimeFormat } from './types.ts'
import { formatClock } from './time.ts'

/** Whole minutes from `now` until the departure. Negative once it has passed. */
export function minutesUntil(arrivalAt: string, now: Date): number {
  const ms = new Date(arrivalAt).getTime() - now.getTime()
  return Math.round(ms / 60_000)
}

/**
 * 'Due' | '1 min' | '12 min' | '6:42 PM'
 *
 * A train flagged as approaching always reads 'Due' regardless of the arithmetic —
 * the CTA sets that flag when the train is entering the station, which is more
 * accurate than the prediction timestamp at that range.
 */
export function formatDeparture(
  departure: Departure,
  now: Date,
  format: TimeFormat,
  timeZone?: string,
): string {
  if (format === 'clock') {
    return formatClock(new Date(departure.arrivalAt), timeZone)
  }
  if (departure.isApproaching) return 'Due'
  const mins = minutesUntil(departure.arrivalAt, now)
  if (mins <= 0) return 'Due'
  return `${mins} min`
}

/** Keeps departures inside [now, now + windowMinutes]. Used by the digest. */
export function withinWindow(
  departures: Departure[],
  now: Date,
  windowMinutes: number,
): Departure[] {
  const start = now.getTime()
  const end = start + windowMinutes * 60_000
  return departures.filter((d) => {
    const t = new Date(d.arrivalAt).getTime()
    return t >= start - 60_000 && t <= end
  })
}

/** Drops stale predictions and orders soonest-first. */
export function sortAndPrune(departures: Departure[], now: Date): Departure[] {
  const cutoff = now.getTime() - 60_000
  return departures
    .filter((d) => new Date(d.arrivalAt).getTime() >= cutoff)
    .sort((a, b) => a.arrivalAt.localeCompare(b.arrivalAt))
}
