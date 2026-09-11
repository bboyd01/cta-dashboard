/**
 * The triple-dot control on each card: switch direction, reconfigure, remove.
 *
 * It opens a modal sheet rather than a dropdown. A dropdown anchored inside the
 * card is clipped by the card's own rounded overflow and, on a phone, by the
 * viewport: the direction list is exactly the part that gets cut off. The sheet
 * renders into <body>, so it is bounded by the screen and scrolls on its own.
 *
 * Direction lives here because it is the setting you change most often, and the
 * options are derived from the stop pairs rather than hard-coded — a station
 * with two platforms offers both plus 'Both directions'.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '../../shared/types.ts'

export type DirectionChoice = {
  /** null means both directions. */
  direction: string | null
  label: string
  stopIds: string[]
}

type Props = {
  card: Card
  subtitle: string
  choices: DirectionChoice[]
  onChangeDirection: (choice: DirectionChoice) => void
  onReconfigure: () => void
  onRemove: () => void
}

export function CardMenu({
  card, subtitle, choices, onChangeDirection, onReconfigure, onRemove,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Options for ${card.title}`}
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>

      {open && (
        <CardSheet
          card={card}
          subtitle={subtitle}
          choices={choices}
          onClose={() => setOpen(false)}
          onChangeDirection={onChangeDirection}
          onReconfigure={onReconfigure}
          onRemove={onRemove}
        />
      )}
    </>
  )
}

function CardSheet({
  card, subtitle, choices, onClose, onChangeDirection, onReconfigure, onRemove,
}: Props & { onClose: () => void }) {
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sheet.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // The page behind a sheet must not scroll with it on touch devices.
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
        <h2 id={titleId}>{card.title}</h2>
        <p className="dialog-hint">{subtitle}</p>

        {choices.length > 0 && (
          <>
            <div className="menu-label" id={`${titleId}-direction`}>Direction</div>
            <div role="radiogroup" aria-labelledby={`${titleId}-direction`}>
              {choices.map((choice) => (
                <SheetItem
                  key={choice.label}
                  checked={card.direction === choice.direction}
                  onSelect={() => {
                    onChangeDirection(choice)
                    onClose()
                  }}
                >
                  {choice.label}
                </SheetItem>
              ))}
            </div>
            <div className="menu-sep" />
          </>
        )}

        <SheetItem onSelect={() => { onReconfigure(); onClose() }}>
          Change route or stop…
        </SheetItem>
        <SheetItem danger onSelect={() => { onRemove(); onClose() }}>
          Remove card
        </SheetItem>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SheetItem({
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
      role={checked === undefined ? undefined : 'radio'}
      aria-checked={checked}
      className={`menu-item${danger ? ' menu-item-danger' : ''}`}
      onClick={onSelect}
    >
      <span>{children}</span>
      {checked ? <span aria-hidden="true">✓</span> : null}
    </button>
  )
}
