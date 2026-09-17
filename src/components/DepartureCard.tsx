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
    elementRef.current = e.currentTarget
    startPos.current = { x: e.clientX, y: e.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      if (pointerIdRef.current !== null) {
        elementRef.current?.releasePointerCapture(pointerIdRef.current)
      }
      onDragStart()
    }, 120)
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
        <span aria-hidden="true">·</span>
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
                  {departure.isDelayed && (
                    <span className="departure-flag" data-kind="delayed">delayed</span>
                  )}
                </span>
                <span className="departure-time" data-due={time === 'Due'}>
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
