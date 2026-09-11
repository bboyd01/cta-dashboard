import { describe, it, expect } from 'vitest'
import { formatDeparture, minutesUntil, withinWindow, sortAndPrune } from './format.ts'
import type { Departure } from './types.ts'

const NOW = new Date('2026-09-11T12:00:00Z')

function dep(overrides: Partial<Departure> = {}): Departure {
  return {
    route: 'Brn',
    destination: 'Loop',
    arrivalAt: '2026-09-11T12:07:00Z',
    isApproaching: false,
    isDelayed: false,
    isScheduled: false,
    stopId: '30016',
    direction: 'S',
    ...overrides,
  }
}

describe('formatDeparture', () => {
  it('renders a countdown in minutes', () => {
    expect(formatDeparture(dep(), NOW, 'countdown')).toBe('7 min')
  })

  it('renders the literal Chicago clock time', () => {
    expect(formatDeparture(dep(), NOW, 'clock')).toBe('7:07 AM')
  })

  it('says Due when the train is approaching, whatever the timestamp says', () => {
    expect(formatDeparture(dep({ isApproaching: true }), NOW, 'countdown')).toBe('Due')
  })

  it('says Due at or past the arrival time', () => {
    expect(formatDeparture(dep({ arrivalAt: '2026-09-11T12:00:00Z' }), NOW, 'countdown')).toBe('Due')
    expect(formatDeparture(dep({ arrivalAt: '2026-09-11T11:59:00Z' }), NOW, 'countdown')).toBe('Due')
  })

  it('still shows a clock time for an approaching train', () => {
    expect(formatDeparture(dep({ isApproaching: true }), NOW, 'clock')).toBe('7:07 AM')
  })
})

describe('minutesUntil', () => {
  it('rounds to the nearest minute', () => {
    expect(minutesUntil('2026-09-11T12:07:20Z', NOW)).toBe(7)
    expect(minutesUntil('2026-09-11T12:07:40Z', NOW)).toBe(8)
  })

  it('goes negative once the departure has passed', () => {
    expect(minutesUntil('2026-09-11T11:55:00Z', NOW)).toBe(-5)
  })
})

describe('withinWindow', () => {
  it('keeps only departures inside the relative window', () => {
    const departures = [
      dep({ arrivalAt: '2026-09-11T12:05:00Z' }),
      dep({ arrivalAt: '2026-09-11T12:29:00Z' }),
      dep({ arrivalAt: '2026-09-11T12:45:00Z' }),
    ]
    const kept = withinWindow(departures, NOW, 30)
    expect(kept.map((d) => d.arrivalAt)).toEqual([
      '2026-09-11T12:05:00Z',
      '2026-09-11T12:29:00Z',
    ])
  })

  it('returns empty rather than throwing when nothing is in range', () => {
    expect(withinWindow([dep({ arrivalAt: '2026-09-11T14:00:00Z' })], NOW, 30)).toEqual([])
  })
})

describe('sortAndPrune', () => {
  it('drops stale predictions and orders soonest first', () => {
    const departures = [
      dep({ arrivalAt: '2026-09-11T12:20:00Z' }),
      dep({ arrivalAt: '2026-09-11T11:50:00Z' }),
      dep({ arrivalAt: '2026-09-11T12:04:00Z' }),
    ]
    expect(sortAndPrune(departures, NOW).map((d) => d.arrivalAt)).toEqual([
      '2026-09-11T12:04:00Z',
      '2026-09-11T12:20:00Z',
    ])
  })
})
