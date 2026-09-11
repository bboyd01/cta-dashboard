import { CtaError } from './types.ts'
import { wallClockToInstant } from '../../shared/time.ts'

const REQUEST_TIMEOUT_MS = 10_000

/** GET JSON with a timeout, mapping every failure onto CtaError. */
export async function getJson(url: URL, label: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    throw new CtaError(timedOut ? `${label} timed out` : `${label} unreachable`, { cause: error })
  }

  if (!response.ok) {
    throw new CtaError(`${label} returned HTTP ${response.status}`)
  }
  try {
    return await response.json()
  } catch (error) {
    throw new CtaError(`${label} returned a malformed response`, { cause: error })
  }
}

/**
 * Train Tracker timestamps: '2026-09-11T06:42:30', Chicago wall clock, no offset.
 * Returns null for anything unparseable so one bad row cannot take down a card.
 */
export function parseTrainTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  return toIso(m[1], m[2], m[3], m[4], m[5], m[6])
}

/** Bus Tracker timestamps: '20260911 06:42' (or with seconds when tmres=s). */
export function parseBusTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!m) return null
  return toIso(m[1], m[2], m[3], m[4], m[5], m[6] ?? '0')
}

function toIso(
  year: string, month: string, day: string, hour: string, minute: string, second: string,
): string | null {
  const instant = wallClockToInstant({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  })
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString()
}

/** The CTA feeds return '0'/'1' and true/false interchangeably across fields. */
export function truthy(value: unknown): boolean {
  return value === true || value === '1' || value === 1 || value === 'true'
}

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}
