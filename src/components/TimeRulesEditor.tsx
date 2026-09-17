/**
 * The list of start/end time windows on a group, edited in-place. Cancel/Save
 * live in the parent dialog — this component just holds the draft array.
 */

import type { TimeWindow } from '../../shared/types.ts'
import { newId } from '../lib/id.ts'

type Props = {
  windows: TimeWindow[]
  onChange: (windows: TimeWindow[]) => void
}

export function TimeRulesEditor({ windows, onChange }: Props) {
  function update(id: string, patch: Partial<TimeWindow>) {
    onChange(windows.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }

  function remove(id: string) {
    onChange(windows.filter((w) => w.id !== id))
  }

  function add() {
    onChange([...windows, { id: newId('win'), start: '06:00', end: '09:00' }])
  }

  return (
    <div className="field">
      <label>Time rules</label>
      <p className="dialog-hint">
        Automatically show this group during these windows (Chicago time).
      </p>

      {windows.map((w) => {
        const invalid = w.start >= w.end
        return (
          <div className="time-window-row" key={w.id}>
            <input
              type="time"
              value={w.start}
              aria-label="Start time"
              onChange={(e) => update(w.id, { start: e.target.value })}
            />
            <span aria-hidden="true">–</span>
            <input
              type="time"
              value={w.end}
              aria-label="End time"
              onChange={(e) => update(w.id, { end: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Remove time window"
              onClick={() => remove(w.id)}
            >
              ×
            </button>
            {invalid && <p className="banner banner-error">End time must be after start time.</p>}
          </div>
        )
      })}

      <button type="button" className="btn" onClick={add}>+ Add time window</button>
    </div>
  )
}
