/**
 * The triple-dot menu on each card: switch direction, reconfigure, remove.
 *
 * Direction lives here because it is the setting you change most often, and the
 * options are derived from the stop pairs rather than hard-coded — a station
 * with two platforms offers both plus 'Both directions'.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Card } from '../../shared/types.ts'

export type DirectionChoice = {
  /** null means both directions. */
  direction: string | null
  label: string
  stopIds: string[]
}

type Props = {
  card: Card
  choices: DirectionChoice[]
  onChangeDirection: (choice: DirectionChoice) => void
  onReconfigure: () => void
  onRemove: () => void
}

export function CardMenu({ card, choices, onChangeDirection, onReconfigure, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Dismiss on outside click or Escape, so the menu never strands the card.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${card.title}`}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">Direction</div>
          {choices.map((choice) => (
            <MenuItem
              key={choice.label}
              checked={card.direction === choice.direction}
              onSelect={() => {
                onChangeDirection(choice)
                setOpen(false)
              }}
            >
              {choice.label}
            </MenuItem>
          ))}

          <div className="menu-sep" />
          <MenuItem onSelect={() => { onReconfigure(); setOpen(false) }}>
            Change route or stop…
          </MenuItem>
          <MenuItem danger onSelect={() => { onRemove(); setOpen(false) }}>
            Remove card
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children, onSelect, checked, danger,
}: {
  children: ReactNode
  onSelect: () => void
  checked?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className={`menu-item${danger ? ' menu-item-danger' : ''}`}
      onClick={onSelect}
    >
      <span>{children}</span>
      {checked ? <span aria-hidden="true">✓</span> : null}
    </button>
  )
}
