/** Pure logic for picking which group is currently "active" (shown by default). */

import type { Group } from './types.ts'
import { hhmm } from './time.ts'

/**
 * The first group (by array order) with a time window covering `now`, or null if
 * none is active right now. Array order is the precedence: "top/left-most wins".
 */
export function rulesActiveGroupId(groups: Group[], now: Date): string | null {
  const current = hhmm(now)
  for (const group of groups) {
    if (group.timeWindows.some((w) => current >= w.start && current < w.end)) return group.id
  }
  return null
}

/**
 * Which group to show on page load: an active time rule wins; otherwise fall back
 * to the last group the user manually picked; otherwise the first group.
 */
export function initialActiveGroupId(
  groups: Group[],
  lastSelectedGroupId: string | null,
  now: Date,
): string | null {
  const rulesId = rulesActiveGroupId(groups, now)
  if (rulesId != null) return rulesId
  if (lastSelectedGroupId != null && groups.some((g) => g.id === lastSelectedGroupId)) {
    return lastSelectedGroupId
  }
  return groups[0]?.id ?? null
}
