import { useEffect, useMemo, useState } from 'react'
import type { Card, Station } from '../../shared/types.ts'
import { directionOptions } from '../../shared/directions.ts'
import { api } from '../api.ts'
import { useDepartures } from '../hooks/useDepartures.ts'
import type { ConfigState } from '../hooks/useConfig.ts'
import { DepartureCard } from '../components/DepartureCard.tsx'
import type { DirectionChoice } from '../components/CardMenu.tsx'
import { AddCardDialog } from '../components/AddCardDialog.tsx'

export function Dashboard({ configState }: { configState: ConfigState }) {
  const { config, update } = configState
  const cards = config?.cards ?? []
  const { data, error, loading, updatedAt, isStale, refresh } = useDepartures(cards.length > 0)
  const [editing, setEditing] = useState<Card | null>(null)
  const [adding, setAdding] = useState(false)
  const [stations, setStations] = useState<Station[]>([])
  // Re-renders countdowns between polls.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  // The direction menu needs the stop pairs, which only the station list knows.
  useEffect(() => {
    if (!cards.some((card) => card.kind === 'train')) return
    api.stations().then((catalog) => setStations(catalog.stations)).catch(() => setStations([]))
  }, [cards.length])

  const byCardId = useMemo(() => new Map(data.map((entry) => [entry.cardId, entry])), [data])

  function directionChoices(card: Card): DirectionChoice[] {
    if (card.kind === 'bus') {
      // A bus stop id is one side of the street, so there is no second stop to
      // offer here; direction changes go through the full picker instead.
      return card.direction ? [{ direction: card.direction, label: card.direction, stopIds: card.stopIds }] : []
    }
    const stops = stations
      .find((station) => station.mapId === card.stationId)
      ?.stops.filter((stop) => stop.lines.includes(card.route)) ?? []
    if (stops.length === 0) return []
    const options = directionOptions(stops)
    return [
      ...options.map((option) => ({
        direction: option.label,
        label: option.label,
        stopIds: option.stopIds,
      })),
      { direction: null, label: 'Both directions', stopIds: stops.map((stop) => stop.stopId) },
    ]
  }

  async function saveCard(card: Card) {
    await update((current) => ({
      ...current,
      cards: current.cards.some((existing) => existing.id === card.id)
        ? current.cards.map((existing) => (existing.id === card.id ? card : existing))
        : [...current.cards, card],
    }))
    setAdding(false)
    setEditing(null)
    refresh()
  }

  async function removeCard(id: string) {
    await update((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== id),
      // Keep digests consistent so a rule cannot point at a card that is gone.
      digests: current.digests.map((rule) => ({
        ...rule,
        cardIds: rule.cardIds.filter((cardId) => cardId !== id),
      })),
    }))
  }

  if (!config) return <p className="banner">Loading…</p>

  return (
    <>
      <div className="toolbar">
        <span className="status" data-stale={isStale} aria-live="polite">
          {loading && !updatedAt
            ? 'Loading…'
            : updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], {
                  hour: 'numeric', minute: '2-digit',
                })}`
              : ''}
        </span>
        <button type="button" className="btn" onClick={refresh}>Refresh</button>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add card
        </button>
      </div>

      {error && <p className="banner banner-error">{error}</p>}

      {cards.length === 0 ? (
        <div className="empty">
          <h2>No cards yet</h2>
          <p>Add a train or bus card to start tracking departures.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Add your first card
          </button>
        </div>
      ) : (
        <div className="grid" data-columns={config.display.columns}>
          {cards.map((card) => (
            <DepartureCard
              key={card.id}
              card={card}
              result={byCardId.get(card.id)}
              timeFormat={config.display.timeFormat}
              limit={config.display.departuresPerCard}
              now={now}
              stale={isStale}
              directionChoices={directionChoices(card)}
              onChangeDirection={(choice) =>
                void saveCard({ ...card, direction: choice.direction, stopIds: choice.stopIds })
              }
              onReconfigure={() => setEditing(card)}
              onRemove={() => void removeCard(card.id)}
            />
          ))}
        </div>
      )}

      {(adding || editing) && (
        <AddCardDialog
          existing={editing ?? undefined}
          onCancel={() => { setAdding(false); setEditing(null) }}
          onSave={(card) => void saveCard(card)}
        />
      )}
    </>
  )
}
