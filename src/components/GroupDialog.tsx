/** Create a group, or rename one / edit its time rules — same form either way. */

import { useEffect, useState } from 'react'
import type { Group, TimeWindow } from '../../shared/types.ts'
import { newId } from '../lib/id.ts'
import { TimeRulesEditor } from './TimeRulesEditor.tsx'

type Props = {
  /** Present when editing an existing group. */
  existing?: Group
  onCancel: () => void
  onSave: (group: Group) => void
}

export function GroupDialog({ existing, onCancel, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [windows, setWindows] = useState<TimeWindow[]>(existing?.timeWindows ?? [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const invalid = name.trim().length === 0 || windows.some((w) => w.start >= w.end)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (invalid) return
    onSave(
      existing
        ? { ...existing, name: name.trim(), timeWindows: windows }
        : { id: newId('group'), name: name.trim(), cardIds: [], timeWindows: windows },
    )
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="group-dialog-title">{existing ? 'Edit group' : 'Add a group'}</h2>
        <p className="dialog-hint">Name your group and, optionally, when it should show automatically.</p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="group-name">Group name</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning commute"
              autoFocus
            />
          </div>

          <TimeRulesEditor windows={windows} onChange={setWindows} />

          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={invalid}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
