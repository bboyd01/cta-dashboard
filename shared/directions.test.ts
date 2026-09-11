import { describe, it, expect } from 'vitest'
import { directionOptions } from './directions.ts'
import type { StationStop } from './types.ts'

const stop = (stopId: string, label: string): StationStop =>
  ({ stopId, label, direction: 'N', lines: ['Brn'] })

describe('directionOptions', () => {
  it('keeps distinct directions apart', () => {
    expect(directionOptions([stop('30374', 'Kimball-bound'), stop('30375', 'Loop-bound')]))
      .toEqual([
        { label: 'Kimball-bound', stopIds: ['30374'] },
        { label: 'Loop-bound', stopIds: ['30375'] },
      ])
  })

  it('offers the two Loop elevated tracks as one choice covering both', () => {
    expect(directionOptions([stop('30374', 'Loop-bound'), stop('30375', 'Loop-bound')]))
      .toEqual([{ label: 'Loop-bound', stopIds: ['30374', '30375'] }])
  })

  it('handles a station with no platforms for the line', () => {
    expect(directionOptions([])).toEqual([])
  })
})
