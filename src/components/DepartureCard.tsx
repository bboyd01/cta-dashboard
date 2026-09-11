import type { Card, CardDepartures, TimeFormat } from '../../shared/types.ts'
import { accentFor } from '../../shared/lines.ts'
import { formatDeparture } from '../../shared/format.ts'
import { LineIcon } from './LineIcon.tsx'
import { CardMenu, type DirectionChoice } from './CardMenu.tsx'

type Props = {
  card: Card
  result: CardDepartures | undefined
  timeFormat: TimeFormat
  limit: number
  now: Date
  stale: boolean
  directionChoices: DirectionChoice[]
  onChangeDirection: (choice: DirectionChoice) => void
  onReconfigure: () => void
  onRemove: () => void
}

export function DepartureCard({
  card, result, timeFormat, limit, now, stale, directionChoices,
  onChangeDirection, onReconfigure, onRemove,
}: Props) {
  const accent = accentFor(card.route)
  const departures = (result?.departures ?? []).slice(0, limit)
  const where = card.stationName || card.stationId
  const direction = card.direction ?? 'Both directions'

  return (
    <article
      className="card"
      data-stale={stale}
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
          <p className="card-subtitle">
            <span className="card-where">{where}</span>
            <span aria-hidden="true">·</span>
            <span className="card-direction">{direction}</span>
          </p>
        </div>
        <CardMenu
          card={card}
          subtitle={`${where} · ${direction}`}
          choices={directionChoices}
          onChangeDirection={onChangeDirection}
          onReconfigure={onReconfigure}
          onRemove={onRemove}
        />
      </div>

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
