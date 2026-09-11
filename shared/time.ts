/**
 * Time zone helpers built on Intl — no tz library.
 *
 * The CTA feeds return *wall clock* timestamps with no offset ('2024-01-15T14:23:45'
 * from the train API, '20240115 14:23' from the bus API). They are always Chicago
 * local time, so parsing them with `new Date()` silently yields the wrong instant on
 * any server not set to America/Chicago — including every Docker container, which
 * runs UTC by default. Everything that touches a CTA timestamp goes through here.
 */

export const CHICAGO = 'America/Chicago'

export type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatterCache.set(timeZone, fmt)
  }
  return fmt
}

/** Wall-clock components of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string = CHICAGO): ZonedParts {
  const found: Record<string, number> = {}
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  return {
    year: found.year,
    month: found.month,
    day: found.day,
    // Some runtimes report midnight as hour 24 under hour12:false.
    hour: found.hour % 24,
    minute: found.minute,
    second: found.second,
  }
}

/** Offset of `timeZone` from UTC, in ms, at the instant `date`. */
function offsetMsAt(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - date.getTime()
}

/**
 * Interpret wall-clock components in `timeZone` as a real instant.
 *
 * The offset depends on the instant we are trying to find, so we guess once using
 * the offset at the naive timestamp and refine once. The second pass is what makes
 * the DST-transition days come out right.
 */
export function wallClockToInstant(
  parts: ZonedParts,
  timeZone: string = CHICAGO,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let ts = naive - offsetMsAt(new Date(naive), timeZone)
  ts = naive - offsetMsAt(new Date(ts), timeZone)
  return new Date(ts)
}

const clockFormatterCache = new Map<string, Intl.DateTimeFormat>()

/** '6:42 PM' */
export function formatClock(date: Date, timeZone: string = CHICAGO): string {
  let fmt = clockFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    clockFormatterCache.set(timeZone, fmt)
  }
  return fmt.format(date)
}

/** 'YYYY-MM-DD' in the zone — the digest dedupe key. */
export function dayKey(date: Date, timeZone: string = CHICAGO): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** 'HH:MM' 24-hour in the zone — compared against DigestRule.time. */
export function hhmm(date: Date, timeZone: string = CHICAGO): string {
  const p = zonedParts(date, timeZone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>()

/** 0-6, Sunday = 0, in the zone. */
export function weekday(date: Date, timeZone: string = CHICAGO): number {
  let fmt = weekdayFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    weekdayFormatterCache.set(timeZone, fmt)
  }
  return WEEKDAYS.indexOf(fmt.format(date))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
