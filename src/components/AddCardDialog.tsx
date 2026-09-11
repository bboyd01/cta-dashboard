/**
 * Add or reconfigure a card.
 *
 * Trains go line → station → direction; buses go route → direction → stop,
 * because a CTA bus stop id is already direction-specific (the two sides of the
 * street are different ids). 'Both directions' therefore means two stop ids in
 * both cases, which is why a Card holds a list rather than a single stop.
 */

import { useEffect, useMemo, useState } from 'react'
import type { BusRoute, BusStop, Card, Station } from '../../shared/types.ts'
import { LINES, type LineId } from '../../shared/lines.ts'
import { api, type LineSummary } from '../api.ts'

type Props = {
  /** Present when editing an existing card. */
  existing?: Card
  onCancel: () => void
  onSave: (card: Card) => void
}

const BOTH = '__both__'

function newId(): string {
  return `card_${Math.random().toString(36).slice(2, 10)}`
}

export function AddCardDialog({ existing, onCancel, onSave }: Props) {
  const [kind, setKind] = useState<'train' | 'bus'>(existing?.kind ?? 'train')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{existing ? 'Change card' : 'Add a card'}</h2>
        <p className="dialog-hint">Pick what to track and which direction to show.</p>

        <div className="field">
          <label id="kind-label">Type</label>
          <div className="choice-row" role="group" aria-labelledby="kind-label">
            <button
              type="button" className="choice" aria-pressed={kind === 'train'}
              onClick={() => setKind('train')}
            >
              Train
            </button>
            <button
              type="button" className="choice" aria-pressed={kind === 'bus'}
              onClick={() => setKind('bus')}
            >
              Bus
            </button>
          </div>
        </div>

        {kind === 'train' ? (
          <TrainPicker existing={existing} onCancel={onCancel} onSave={onSave} />
        ) : (
          <BusPicker existing={existing} onCancel={onCancel} onSave={onSave} />
        )}
      </div>
    </div>
  )
}

function Actions({ onCancel, disabled }: { onCancel: () => void; disabled: boolean }) {
  return (
    <div className="dialog-actions">
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={disabled}>Save card</button>
    </div>
  )
}

function TrainPicker({ existing, onCancel, onSave }: Props) {
  const initialLine = existing?.kind === 'train' ? (existing.route as LineId) : 'Brn'
  const [lines, setLines] = useState<LineSummary[]>([])
  const [line, setLine] = useState<LineId>(initialLine)
  const [stations, setStations] = useState<Station[]>([])
  const [isSeed, setIsSeed] = useState(false)
  const [mapId, setMapId] = useState(existing?.stationId ?? '')
  const [direction, setDirection] = useState(existing?.direction ?? BOTH)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.lines().then(setLines).catch(() => setLines([]))
  }, [])

  useEffect(() => {
    let active = true
    api
      .stations(line)
      .then((catalog) => {
        if (!active) return
        setStations(catalog.stations)
        setIsSeed(catalog.isSeed)
        // Keep the current station when it also serves the newly picked line.
        setMapId((current) =>
          catalog.stations.some((s) => s.mapId === current)
            ? current
            : (catalog.stations[0]?.mapId ?? ''),
        )
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load stations'),
      )
    return () => { active = false }
  }, [line])

  const station = stations.find((s) => s.mapId === mapId)
  // Only the platforms this line calls at; at Clark/Lake the Blue subway
  // platforms are not Brown Line directions.
  const stops = useMemo(
    () => station?.stops.filter((stop) => stop.lines.includes(line)) ?? [],
    [station, line],
  )

  useEffect(() => {
    if (direction !== BOTH && !stops.some((stop) => stop.label === direction)) setDirection(BOTH)
  }, [stops, direction])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!station) return
    const chosen = direction === BOTH ? stops : stops.filter((stop) => stop.label === direction)
    if (chosen.length === 0) return
    onSave({
      id: existing?.id ?? newId(),
      kind: 'train',
      route: line,
      title: LINES[line].name,
      stationId: station.mapId,
      stationName: station.name,
      direction: direction === BOTH ? null : direction,
      stopIds: chosen.map((stop) => stop.stopId),
    })
  }

  return (
    <form onSubmit={submit}>
      {error && <p className="banner banner-error">{error}</p>}
      {isSeed && (
        <p className="banner">
          Showing a small built-in station list. The full list loads once the server can
          reach the city data portal.
        </p>
      )}

      <div className="field">
        <label htmlFor="line">Line</label>
        <select id="line" value={line} onChange={(e) => setLine(e.target.value as LineId)}>
          {(lines.length ? lines : Object.values(LINES)).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="station">Station</label>
        <select id="station" value={mapId} onChange={(e) => setMapId(e.target.value)}>
          {stations.length === 0 && <option value="">No stations available</option>}
          {stations.map((item) => (
            <option key={item.mapId} value={item.mapId}>{item.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="direction">Direction</label>
        <select id="direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
          {stops.map((stop) => (
            <option key={stop.stopId} value={stop.label}>{stop.label}</option>
          ))}
          <option value={BOTH}>Both directions</option>
        </select>
      </div>

      <Actions onCancel={onCancel} disabled={!station || stops.length === 0} />
    </form>
  )
}

function BusPicker({ existing, onCancel, onSave }: Props) {
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [route, setRoute] = useState(existing?.kind === 'bus' ? existing.route : '')
  const [directions, setDirections] = useState<string[]>([])
  const [direction, setDirection] = useState(existing?.direction ?? '')
  const [stops, setStops] = useState<BusStop[]>([])
  const [stopId, setStopId] = useState(existing?.stopIds[0] ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .busRoutes()
      .then((list) => {
        setRoutes(list)
        setRoute((current) => current || (list[0]?.route ?? ''))
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load bus routes'),
      )
  }, [])

  useEffect(() => {
    if (!route) return
    let active = true
    api
      .busDirections(route)
      .then((list) => {
        if (!active) return
        setDirections(list)
        setDirection((current) => (list.includes(current) ? current : (list[0] ?? '')))
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load directions'),
      )
    return () => { active = false }
  }, [route])

  useEffect(() => {
    if (!route || !direction) return
    let active = true
    api
      .busStops(route, direction)
      .then((list) => {
        if (!active) return
        setStops(list)
        setStopId((current) =>
          list.some((s) => s.stopId === current) ? current : (list[0]?.stopId ?? ''),
        )
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load stops'),
      )
    return () => { active = false }
  }, [route, direction])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const stop = stops.find((s) => s.stopId === stopId)
    const name = routes.find((r) => r.route === route)?.name ?? route
    if (!stop) return
    onSave({
      id: existing?.id ?? newId(),
      kind: 'bus',
      route,
      title: `#${route} ${name}`,
      stationId: stop.stopId,
      stationName: stop.name,
      direction,
      stopIds: [stop.stopId],
    })
  }

  return (
    <form onSubmit={submit}>
      {error && <p className="banner banner-error">{error}</p>}

      <div className="field">
        <label htmlFor="route">Route</label>
        <select id="route" value={route} onChange={(e) => setRoute(e.target.value)}>
          {routes.length === 0 && <option value="">No routes available</option>}
          {routes.map((item) => (
            <option key={item.route} value={item.route}>#{item.route} {item.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="bus-direction">Direction</label>
        <select
          id="bus-direction" value={direction} onChange={(e) => setDirection(e.target.value)}
        >
          {directions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="stop">Stop</label>
        <select id="stop" value={stopId} onChange={(e) => setStopId(e.target.value)}>
          {stops.length === 0 && <option value="">No stops available</option>}
          {stops.map((item) => (
            <option key={item.stopId} value={item.stopId}>{item.name}</option>
          ))}
        </select>
        <p className="setting-hint">
          A bus stop id covers one side of the street, so each direction is its own card.
        </p>
      </div>

      <Actions onCancel={onCancel} disabled={stops.length === 0 || !stopId} />
    </form>
  )
}
