/**
 * Add or reconfigure a card.
 *
 * Trains and Metra both go line → station → direction; buses go route →
 * direction → stop, because a CTA bus stop id is already direction-specific
 * (the two sides of the street are different ids). 'Both directions'
 * therefore means two stop ids in all cases, which is why a Card holds a list
 * rather than a single stop.
 */

import { useEffect, useMemo, useState } from 'react'
import type { BusRoute, BusStop, Card, CardKind, Station } from '../../shared/types.ts'
import { LINES } from '../../shared/lines.ts'
import { METRA_LINES } from '../../shared/metraLines.ts'
import { directionOptions } from '../../shared/directions.ts'
import { api, type LineSummary, type MetraLineSummary } from '../api.ts'
import { Combobox } from './Combobox.tsx'
import { newId } from '../lib/id.ts'

type Props = {
  /** Present when editing an existing card. */
  existing?: Card
  onCancel: () => void
  onSave: (card: Card) => void
}

const BOTH = '__both__'

export function AddCardDialog({ existing, onCancel, onSave }: Props) {
  const [kind, setKind] = useState<CardKind>(existing?.kind ?? 'train')

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
              type="button" className="choice" aria-pressed={kind === 'metra'}
              onClick={() => setKind('metra')}
            >
              Metra
            </button>
            <button
              type="button" className="choice" aria-pressed={kind === 'bus'}
              onClick={() => setKind('bus')}
            >
              Bus
            </button>
          </div>
        </div>

        {kind === 'train' && (
          <RailPicker
            kind="train"
            existing={existing}
            onCancel={onCancel}
            onSave={onSave}
            defaultLine="Brn"
            lines={LINES}
            fetchLines={api.lines}
            fetchStations={api.stations}
          />
        )}
        {kind === 'metra' && (
          <RailPicker
            kind="metra"
            existing={existing}
            onCancel={onCancel}
            onSave={onSave}
            defaultLine="BNSF"
            lines={METRA_LINES}
            fetchLines={api.metraLines}
            fetchStations={api.metraStations}
          />
        )}
        {kind === 'bus' && <BusPicker existing={existing} onCancel={onCancel} onSave={onSave} />}
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

type RailLineSummary = LineSummary | MetraLineSummary

type RailPickerProps = Props & {
  /** 'train' picks CTA 'L' lines; 'metra' picks Metra lines. Same line -> station -> direction flow. */
  kind: 'train' | 'metra'
  defaultLine: string
  lines: Record<string, { id: string; name: string; color: string }>
  fetchLines: () => Promise<RailLineSummary[]>
  fetchStations: (line: string) => Promise<{ isSeed: boolean; stations: Station[] }>
}

/**
 * Line -> station -> direction, shared by CTA trains and Metra: both model a
 * station as platforms grouped by direction, so the only thing that differs
 * between the two modes is which catalog endpoints and line colors back it.
 */
function RailPicker({
  kind, existing, onCancel, onSave, defaultLine, lines: staticLines, fetchLines, fetchStations,
}: RailPickerProps) {
  const initialLine = existing?.kind === kind ? existing.route : defaultLine
  const [lines, setLines] = useState<RailLineSummary[]>([])
  const [line, setLine] = useState(initialLine)
  const [stations, setStations] = useState<Station[]>([])
  const [isSeed, setIsSeed] = useState(false)
  const [mapId, setMapId] = useState(existing?.stationId ?? '')
  const [direction, setDirection] = useState(existing?.direction ?? BOTH)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLines().then(setLines).catch(() => setLines([]))
  }, [fetchLines])

  useEffect(() => {
    let active = true
    fetchStations(line)
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
  // Platforms that share a direction — both Loop elevated tracks are 'Loop-bound'
  // — are one choice covering both stop ids, not two identical options.
  const directions = useMemo(() => directionOptions(stops), [stops])

  useEffect(() => {
    if (direction !== BOTH && !stops.some((stop) => stop.label === direction)) setDirection(BOTH)
  }, [stops, direction])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!station) return
    const chosen = direction === BOTH ? stops : stops.filter((stop) => stop.label === direction)
    if (chosen.length === 0) return
    onSave({
      id: existing?.id ?? newId('card'),
      kind,
      route: line,
      title: staticLines[line]?.name ?? line,
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
          {kind === 'train'
            ? "Showing a small built-in station list. The full list loads once the server can reach the city data portal."
            : 'Showing a small built-in station list. The full list loads once the server can reach the Metra GTFS feed.'}
        </p>
      )}

      <div className="field">
        <label>Line</label>
        <Combobox
          value={line}
          onChange={setLine}
          options={(lines.length ? lines : Object.values(staticLines)).map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          placeholder="Search lines..."
        />
      </div>

      <div className="field">
        <label>Station</label>
        <Combobox
          value={mapId}
          onChange={setMapId}
          options={stations.map((item) => ({
            value: item.mapId,
            label: item.name,
          }))}
          placeholder="Search stations..."
          disabled={stations.length === 0}
        />
      </div>

      <div className="field">
        <label>Direction</label>
        <Combobox
          value={direction}
          onChange={setDirection}
          options={[
            ...directions.map((option) => ({
              value: option.label,
              label: option.label,
            })),
            { value: BOTH, label: 'Both directions' },
          ]}
          placeholder="Select direction..."
        />
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
      id: existing?.id ?? newId('card'),
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
        <label>Route</label>
        <Combobox
          value={route}
          onChange={setRoute}
          options={routes.map((item) => ({
            value: item.route,
            label: `#${item.route} ${item.name}`,
          }))}
          placeholder="Search routes..."
          disabled={routes.length === 0}
        />
      </div>

      <div className="field">
        <label>Direction</label>
        <Combobox
          value={direction}
          onChange={setDirection}
          options={directions.map((item) => ({
            value: item,
            label: item,
          }))}
          placeholder="Select direction..."
          disabled={directions.length === 0}
        />
      </div>

      <div className="field">
        <label>Stop</label>
        <Combobox
          value={stopId}
          onChange={setStopId}
          options={stops.map((item) => ({
            value: item.stopId,
            label: item.name,
          }))}
          placeholder="Search stops..."
          disabled={stops.length === 0}
        />
        <p className="setting-hint">
          A bus stop id covers one side of the street, so each direction is its own card.
        </p>
      </div>

      <Actions onCancel={onCancel} disabled={stops.length === 0 || !stopId} />
    </form>
  )
}
