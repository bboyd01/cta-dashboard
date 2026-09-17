import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../../shared/types.ts'
import { api } from '../api.ts'
import { useDepartures } from '../hooks/useDepartures.ts'
import type { ConfigState } from '../hooks/useConfig.ts'
import { DepartureCard } from '../components/DepartureCard.tsx'
import { AddCardDialog } from '../components/AddCardDialog.tsx'

export function Dashboard({ configState }: { configState: ConfigState }) {
  const { config, update } = configState
  const cards = config?.cards ?? []
  const { data, error, loading, updatedAt, isStale, refresh } = useDepartures(cards.length > 0)
  const [editing, setEditing] = useState<Card | null>(null)
  const [adding, setAdding] = useState(false)
  // Re-renders countdowns between polls.
  const [now, setNow] = useState(() => new Date())

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const dragRef = useRef({ draggingId: null as string | null, overId: null as string | null })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const byCardId = useMemo(() => new Map(data.map((entry) => [entry.cardId, entry])), [data])

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

  function startDrag(id: string) {
    setDraggingId(id)
    setOverId(id)
    dragRef.current = { draggingId: id, overId: id }

    function onPointerMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const cardEl = el?.closest('[data-card-id]')
      const cardId = cardEl?.getAttribute('data-card-id')
      if (cardId && cardId !== dragRef.current.overId) {
        dragRef.current.overId = cardId
        setOverId(cardId)
      }
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      const { draggingId: fromId, overId: toId } = dragRef.current
      setDraggingId(null)
      setOverId(null)
      dragRef.current = { draggingId: null, overId: null }
      if (fromId && toId && fromId !== toId) {
        void update((current) => {
          const arr = [...current.cards]
          const from = arr.findIndex((c) => c.id === fromId)
          const to = arr.findIndex((c) => c.id === toId)
          if (from === -1 || to === -1) return current
          const [card] = arr.splice(from, 1)
          arr.splice(to, 0, card)
          return { ...current, cards: arr }
        })
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
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
        <div className="grid" data-columns={config.display.columns} data-dragging={draggingId ? true : undefined}>
          {cards.map((card) => (
            <DepartureCard
              key={card.id}
              card={card}
              result={byCardId.get(card.id)}
              timeFormat={config.display.timeFormat}
              limit={config.display.departuresPerCard}
              now={now}
              stale={isStale}
              isDragging={draggingId === card.id}
              isDropTarget={draggingId !== null && overId === card.id && draggingId !== card.id}
              onDragStart={() => startDrag(card.id)}
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
