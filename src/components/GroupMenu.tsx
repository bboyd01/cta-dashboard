/**
 * The options sheet opened by long-pressing a group chip: rename, change time
 * rules, delete. Modeled on CardMenu's sheet, but opened imperatively — a group
 * chip is too small for its own "⋯" trigger button, so long-press is the trigger.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Group } from '../../shared/types.ts'

type Props = {
  group: Group
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

export function GroupMenu({ group, onClose, onEdit, onDelete }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sheet.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog dialog-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheet}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{group.name}</h2>

        {confirmingDelete ? (
          <>
            <p className="dialog-hint">
              Delete this group? Cards that only belong to it will be deleted too.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => { onDelete(); onClose() }}
              >
                Delete group
              </button>
            </div>
          </>
        ) : (
          <>
            <SheetItem onSelect={() => { onEdit(); onClose() }}>Rename group</SheetItem>
            <SheetItem onSelect={() => { onEdit(); onClose() }}>Change time rules</SheetItem>
            <SheetItem danger onSelect={() => setConfirmingDelete(true)}>Delete group</SheetItem>

            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function SheetItem({
  children, onSelect, danger,
}: {
  children: ReactNode
  onSelect: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={`menu-item${danger ? ' menu-item-danger' : ''}`}
      onClick={onSelect}
    >
      <span>{children}</span>
    </button>
  )
}
