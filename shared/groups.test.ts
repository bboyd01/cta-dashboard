import { describe, it, expect } from 'vitest'
import { rulesActiveGroupId, initialActiveGroupId } from './groups.ts'
import { wallClockToInstant } from './time.ts'
import type { Group } from './types.ts'

const at = (hour: number, minute: number) =>
  wallClockToInstant({ year: 2026, month: 9, day: 11, hour, minute, second: 0 })

function group(id: string, windows: Array<[string, string]>): Group {
  return {
    id,
    name: id,
    cardIds: [],
    timeWindows: windows.map(([start, end], i) => ({ id: `${id}-w${i}`, start, end })),
  }
}

describe('rulesActiveGroupId', () => {
  it('returns null when no group has an active window', () => {
    const groups = [group('a', [['06:00', '09:00']])]
    expect(rulesActiveGroupId(groups, at(12, 0))).toBeNull()
  })

  it('returns the id of the one group with an active window', () => {
    const groups = [group('a', [['06:00', '09:00']])]
    expect(rulesActiveGroupId(groups, at(7, 30))).toBe('a')
  })

  it('prefers the first (left-most) group when multiple are active', () => {
    const groups = [group('a', [['06:00', '10:00']]), group('b', [['06:00', '10:00']])]
    expect(rulesActiveGroupId(groups, at(7, 0))).toBe('a')
  })

  it('includes the start boundary', () => {
    const groups = [group('a', [['06:00', '09:00']])]
    expect(rulesActiveGroupId(groups, at(6, 0))).toBe('a')
  })

  it('excludes the end boundary', () => {
    const groups = [group('a', [['06:00', '09:00']])]
    expect(rulesActiveGroupId(groups, at(9, 0))).toBeNull()
  })
})

describe('initialActiveGroupId', () => {
  it('picks the rules-active group when one exists', () => {
    const groups = [group('a', [['06:00', '09:00']])]
    expect(initialActiveGroupId(groups, 'a', at(7, 0))).toBe('a')
  })

  it('falls back to lastSelectedGroupId when no rule is active', () => {
    const groups = [group('a', [['06:00', '09:00']]), group('b', [])]
    expect(initialActiveGroupId(groups, 'b', at(12, 0))).toBe('b')
  })

  it('ignores a stale lastSelectedGroupId that no longer exists', () => {
    const groups = [group('a', [])]
    expect(initialActiveGroupId(groups, 'gone', at(12, 0))).toBe('a')
  })

  it('falls back to the first group when nothing was ever selected', () => {
    const groups = [group('a', []), group('b', [])]
    expect(initialActiveGroupId(groups, null, at(12, 0))).toBe('a')
  })

  it('returns null when there are no groups', () => {
    expect(initialActiveGroupId([], null, at(12, 0))).toBeNull()
  })
})
