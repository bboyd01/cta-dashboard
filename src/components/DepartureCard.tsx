import { useRef } from 'react'
import type { Card, CardDepartures, TimeFormat } from '../../shared/types.ts'
import { accentFor } from '../../shared/lines.ts'
import { formatDeparture } from '../../shared/format.ts'
import { LineIcon } from './LineIcon.tsx'
import { CardMenu } from './CardMenu.tsx'

type Props = {
  card: Card
  result: CardDepartures | undefined
  timeFormat: TimeFormat
  limit: number
  now: Date
  stale: boolean
  isDragging?: boolean
  isDropTarget?: boolean
  onDragStart?: () => void
  onReconfigure: () => void
  onRemove: () => void
}

export function DepartureCard({
  card, result, timeFormat, limit, now, stale,
  isDragging, isDropTarget, onDragStart,
  onReconfigure, onRemove,
}: Props) {
  const accent = accentFor(card.route)
  const departures = (result?.departures ?? []).slice(0, limit)
  const where = card.stationName || card.stationId
  const direction = card.direction ?? 'Both directions'

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const pointerIdRef = useRef<number | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!onDragStart) return
    pointerIdRef.current = e.pointerId
    const el = e.currentTarget
    elementRef.current = el
    startPos.current = { x: e.clientX, y: e.clientY }

    // Attach a non-passive touchmove listener immediately. Before the threshold
    // it does nothing (scroll is allowed). Once the timer fires it prevents
    // default on every touchmove, stopping the browser's scroll for this gesture.
    let dragActive = false
    function blockScroll(te: TouchEvent) {
      if (dragActive) te.preventDefault()
    }
    el.addEventListener('touchmove', blockScroll, { passive: false })

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      dragActive = true
      if (pointerIdRef.current !== null) {
        el.releasePointerCapture(pointerIdRef.current)
      }
      onDragStart()
    }, 120)

    function cleanup() {
      el.removeEventListener('touchmove', blockScroll)
    }
    el.addEventListener('pointerup', cleanup, { once: true })
    el.addEventListener('pointercancel', cleanup, { once: true })
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!longPressTimer.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handlePointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <article
      className="card"
      data-card-id={card.id}
      data-stale={stale}
      data-dragging={isDragging || undefined}
      data-drop-target={isDropTarget || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => { if (onDragStart) e.preventDefault() }}
      style={
        { '--card-accent': accent.color, '--card-on-accent': accent.onColor } as React.CSSProperties
      }
    >
      <div className="card-rule" />
      <div className="card-head">
        <span className="card-badge">
          <LineIcon kind={card.kind} />
        </span>
        <div className="card-heading">
          <h2 className="card-title">{card.title}</h2>
        </div>
        <CardMenu
          card={card}
          subtitle={`${where} · ${direction}`}
          onReconfigure={onReconfigure}
          onRemove={onRemove}
        />
      </div>

      <p className="card-subtitle">
        <span className="card-where">{where}</span>
        <span className="card-sep" aria-hidden="true">·</span>
        <span className="card-direction">{direction}</span>
      </p>

      {result?.error ? (
        <p className="card-empty" data-error="true">{result.error}</p>
      ) : departures.length === 0 ? (
        <p className="card-empty">No departures predicted right now.</p>
      ) : (
        <ul className="departures">
          {departures.map((departure, index) => {
            const time = formatDeparture(departure, now, timeFormat)
            return (
              <li className="departure" key={`${departure.stopId}-${departure.arrivalAt}-${index}`}>
                <span className="departure-dest">
                  <span className="departure-name">{departure.destination}</span>
                  {departure.isScheduled && (
                    <span className="departure-flag" data-kind="scheduled">sched</span>
                  )}
                </span>
                <span
                  className="departure-time"
                  data-due={time === 'Due'}
                  data-delayed={departure.isDelayed}
                >
                  {time}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
