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
  const subtitle = card.direction ? `${where} · ${card.direction}` : `${where} · Both directions`

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
          <p className="card-subtitle">{subtitle}</p>
        </div>
        <CardMenu
          card={card}
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
                  {departure.destination}
                  {departure.isScheduled && <span className="departure-flag">sched</span>}
                  {departure.isDelayed && <span className="departure-flag">delayed</span>}
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
