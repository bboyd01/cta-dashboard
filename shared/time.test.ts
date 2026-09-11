import { describe, it, expect } from 'vitest'
import {
  wallClockToInstant,
  zonedParts,
  formatClock,
  dayKey,
  hhmm,
  weekday,
  CHICAGO,
  hasTimeZoneSupport,
} from './time.ts'

const at = (year: number, month: number, day: number, hour: number, minute: number, second = 0) =>
  wallClockToInstant({ year, month, day, hour, minute, second })

describe('wallClockToInstant', () => {
  it('reads a CST wall clock as the right UTC instant', () => {
    // Central Standard Time is UTC-6.
    expect(at(2026, 1, 15, 14, 23, 45).toISOString()).toBe('2026-01-15T20:23:45.000Z')
  })

  it('reads a CDT wall clock as the right UTC instant', () => {
    // Central Daylight Time is UTC-5.
    expect(at(2026, 7, 15, 14, 23, 0).toISOString()).toBe('2026-07-15T19:23:00.000Z')
  })

  it('is correct on either side of the spring-forward boundary', () => {
    // 2026-03-08: clocks jump 02:00 -> 03:00 CST->CDT.
    expect(at(2026, 3, 8, 1, 30).toISOString()).toBe('2026-03-08T07:30:00.000Z')
    expect(at(2026, 3, 8, 3, 30).toISOString()).toBe('2026-03-08T08:30:00.000Z')
  })

  it('is correct after the fall-back boundary', () => {
    // 2026-11-01: clocks fall 02:00 -> 01:00 CDT->CST.
    expect(at(2026, 11, 1, 3, 0).toISOString()).toBe('2026-11-01T09:00:00.000Z')
  })

  it('round-trips through zonedParts', () => {
    const instant = at(2026, 9, 11, 6, 45)
    expect(zonedParts(instant, CHICAGO)).toMatchObject({
      year: 2026, month: 9, day: 11, hour: 6, minute: 45,
    })
  })

  it('handles midnight without reporting hour 24', () => {
    expect(zonedParts(at(2026, 9, 11, 0, 5)).hour).toBe(0)
  })
})

describe('zone-aware formatting', () => {
  it('formats the clock in Chicago regardless of host zone', () => {
    expect(formatClock(new Date('2026-09-11T23:42:00Z'))).toBe('6:42 PM')
  })

  it('derives the day key in Chicago, not UTC', () => {
    // 01:30 UTC on the 12th is still the evening of the 11th in Chicago.
    expect(dayKey(new Date('2026-09-12T01:30:00Z'))).toBe('2026-09-11')
  })

  it('derives HH:MM in Chicago', () => {
    expect(hhmm(new Date('2026-09-11T11:00:00Z'))).toBe('06:00')
  })

  it('derives the weekday in Chicago, not UTC', () => {
    // Saturday 02:00 UTC is still Friday in Chicago.
    expect(weekday(new Date('2026-09-12T02:00:00Z'))).toBe(5)
  })
})

describe('hasTimeZoneSupport', () => {
  it('confirms the runtime resolves America/Chicago', () => {
    expect(hasTimeZoneSupport()).toBe(true)
  })

  it('reports false for a zone the runtime cannot resolve', () => {
    // A Node build without full ICU behaves like this for every real zone.
    expect(hasTimeZoneSupport('Not/AZone')).toBe(false)
  })
})
