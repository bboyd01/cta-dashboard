/**
 * The row of groups between the toolbar and the card grid. Desktop shows a
 * horizontal, single-line, scrollable row of chips (long-press a chip for
 * options); mobile swaps to a dropdown, since a scrolling chip row and
 * long-press don't translate well to a native-feeling select. The mobile
 * variant gets a "Manage" button next to the dropdown to reach the same
 * options sheet a desktop long-press would open.
 */

import type { Group } from '../../shared/types.ts'
import { Combobox } from './Combobox.tsx'
import { GroupChip } from './GroupChip.tsx'

type Props = {
  groups: Group[]
  activeGroupId: string | null
  onSelect: (id: string) => void
  onAddGroup: () => void
  onManageGroup: (group: Group) => void
}

export function GroupBar({ groups, activeGroupId, onSelect, onAddGroup, onManageGroup }: Props) {
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null

  return (
    <div className="group-bar-wrap">
      <div className="group-bar">
        {groups.map((group) => (
          <GroupChip
            key={group.id}
            group={group}
            isActive={group.id === activeGroupId}
            onSelect={() => onSelect(group.id)}
            onLongPress={() => onManageGroup(group)}
          />
        ))}
        <button type="button" className="group-chip group-chip-add" onClick={onAddGroup}>
          + Add Group
        </button>
      </div>

      <div className="group-bar-mobile">
        <Combobox<string>
          value={activeGroupId ?? ''}
          onChange={onSelect}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="Choose a group…"
        />
        {activeGroup && (
          <button
            type="button"
            className="btn btn-icon"
            aria-label={`Options for ${activeGroup.name}`}
            onClick={() => onManageGroup(activeGroup)}
          >
            ⋯
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onAddGroup}>
          + Add Group
        </button>
      </div>
    </div>
  )
}
