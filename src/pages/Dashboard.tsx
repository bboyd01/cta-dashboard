import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card, Group } from '../../shared/types.ts'
import { initialActiveGroupId, rulesActiveGroupId } from '../../shared/groups.ts'
import { useDepartures } from '../hooks/useDepartures.ts'
import type { ConfigState } from '../hooks/useConfig.ts'
import { DepartureCard } from '../components/DepartureCard.tsx'
import { AddCardDialog } from '../components/AddCardDialog.tsx'
import { GroupBar } from '../components/GroupBar.tsx'
import { GroupMenu } from '../components/GroupMenu.tsx'
import { GroupDialog } from '../components/GroupDialog.tsx'

export function Dashboard({ configState }: { configState: ConfigState }) {
  const { config, update } = configState
  const groups = config?.groups ?? []
  const [editing, setEditing] = useState<Card | null>(null)
  const [adding, setAdding] = useState(false)
  const [menuGroup, setMenuGroup] = useState<Group | null>(null)
  const [groupDialog, setGroupDialog] = useState<{ mode: 'create' } | { mode: 'edit'; group: Group } | null>(null)
  // Re-renders countdowns between polls, and doubles as the group time-rule tick.
  const [now, setNow] = useState(() => new Date())

  // Which group is currently viewed. Initialized once config loads, then kept in
  // sync with an edge-triggered check against rulesActiveGroupId on every tick.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const initializedRef = useRef(false)
  const prevRulesActiveRef = useRef<string | null>(null)

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null
  const cards = useMemo(
    () => (activeGroup ? (config?.cards.filter((c) => activeGroup.cardIds.includes(c.id)) ?? []) : []),
    [config, activeGroup],
  )
  const { data, error, loading, updatedAt, isStale, refresh } = useDepartures(cards.length > 0)

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const dragRef = useRef({ draggingId: null as string | null, overId: null as string | null })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  // One-time initialization once config first loads.
  useEffect(() => {
    if (initializedRef.current || !config) return
    initializedRef.current = true
    const initial = initialActiveGroupId(config.groups, config.lastSelectedGroupId, now)
    setActiveGroupId(initial)
    prevRulesActiveRef.current = rulesActiveGroupId(config.groups, now)
    // Deliberately only depends on config: this should fire once, on load.
  }, [config])

  // Edge-triggered auto-switch: only reacts when the rules-active group actually
  // changes, so it never fights a manual selection made mid-window.
  useEffect(() => {
    if (!initializedRef.current || !config) return
    const rulesId = rulesActiveGroupId(groups, now)
    if (rulesId === prevRulesActiveRef.current) return
    prevRulesActiveRef.current = rulesId
    const next =
      rulesId ??
      (config.lastSelectedGroupId && groups.some((g) => g.id === config.lastSelectedGroupId)
        ? config.lastSelectedGroupId
        : (groups[0]?.id ?? null))
    setActiveGroupId(next)
  }, [now, groups])

  const byCardId = useMemo(() => new Map(data.map((entry) => [entry.cardId, entry])), [data])

  function selectGroup(id: string) {
    setActiveGroupId(id)
    void update((current) => ({ ...current, lastSelectedGroupId: id }))
  }

  async function saveGroup(group: Group) {
    const isNew = !groups.some((g) => g.id === group.id)
    await update((current) => ({
      ...current,
      groups: current.groups.some((g) => g.id === group.id)
        ? current.groups.map((g) => (g.id === group.id ? group : g))
        : [...current.groups, group],
      ...(isNew ? { lastSelectedGroupId: group.id } : {}),
    }))
    if (isNew) setActiveGroupId(group.id)
    setGroupDialog(null)
  }

  async function removeGroup(id: string) {
    await update((current) => {
      const nextGroups = current.groups.filter((g) => g.id !== id)
      const referenced = new Set(nextGroups.flatMap((g) => g.cardIds))
      return {
        ...current,
        groups: nextGroups,
        cards: current.cards.filter((c) => referenced.has(c.id)),
        digests: current.digests.map((rule) => ({
          ...rule,
          cardIds: rule.cardIds.filter((cardId) => referenced.has(cardId)),
        })),
        lastSelectedGroupId: current.lastSelectedGroupId === id ? null : current.lastSelectedGroupId,
      }
    })
    if (activeGroupId === id) {
      setActiveGroupId(groups.find((g) => g.id !== id)?.id ?? null)
    }
  }

  async function saveCard(card: Card) {
    const isNew = !config?.cards.some((existing) => existing.id === card.id)
    await update((current) => ({
      ...current,
      cards: current.cards.some((existing) => existing.id === card.id)
        ? current.cards.map((existing) => (existing.id === card.id ? card : existing))
        : [...current.cards, card],
      groups:
        isNew && activeGroupId
          ? current.groups.map((g) =>
              g.id === activeGroupId ? { ...g, cardIds: [...g.cardIds, card.id] } : g,
            )
          : current.groups,
    }))
    setAdding(false)
    setEditing(null)
    refresh()
  }

  async function removeCard(id: string) {
    await update((current) => {
      const nextGroups = current.groups.map((g) =>
        g.id === activeGroupId ? { ...g, cardIds: g.cardIds.filter((cardId) => cardId !== id) } : g,
      )
      const stillReferenced = nextGroups.some((g) => g.cardIds.includes(id))
      return {
        ...current,
        groups: nextGroups,
        cards: stillReferenced ? current.cards : current.cards.filter((card) => card.id !== id),
        // Keep digests consistent so a rule cannot point at a card that is gone.
        digests: stillReferenced
          ? current.digests
          : current.digests.map((rule) => ({
              ...rule,
              cardIds: rule.cardIds.filter((cardId) => cardId !== id),
            })),
      }
    })
  }

  function startDrag(id: string) {
    setDraggingId(id)
    setOverId(id)
    dragRef.current = { draggingId: id, overId: id }

    function onPointerMove(e: PointerEvent) {
      // elementFromPoint returns the dragging card even with pointer-events:none,
      // so we check bounding rects of all cards directly and skip the drag source.
      for (const cardEl of document.querySelectorAll('[data-card-id]')) {
        const cardId = cardEl.getAttribute('data-card-id')
        if (!cardId || cardId === dragRef.current.draggingId) continue
        const { left, right, top, bottom } = cardEl.getBoundingClientRect()
        if (e.clientX >= left && e.clientX <= right && e.clientY >= top && e.clientY <= bottom) {
          if (cardId !== dragRef.current.overId) {
            dragRef.current.overId = cardId
            setOverId(cardId)
          }
          return
        }
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
        <button
          type="button"
          className="btn btn-primary"
          disabled={!activeGroup}
          onClick={() => setAdding(true)}
        >
          Add card
        </button>
      </div>

      <GroupBar
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={selectGroup}
        onAddGroup={() => setGroupDialog({ mode: 'create' })}
        onManageGroup={(group) => setMenuGroup(group)}
      />

      {error && <p className="banner banner-error">{error}</p>}

      {groups.length === 0 ? (
        <div className="empty">
          <h2>No groups yet</h2>
          <p>Add a group to start tracking departures.</p>
          <button type="button" className="btn btn-primary" onClick={() => setGroupDialog({ mode: 'create' })}>
            Add your first group
          </button>
        </div>
      ) : cards.length === 0 ? (
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

      {menuGroup && (
        <GroupMenu
          group={menuGroup}
          onClose={() => setMenuGroup(null)}
          onEdit={() => setGroupDialog({ mode: 'edit', group: menuGroup })}
          onDelete={() => void removeGroup(menuGroup.id)}
        />
      )}

      {groupDialog && (
        <GroupDialog
          existing={groupDialog.mode === 'edit' ? groupDialog.group : undefined}
          onCancel={() => setGroupDialog(null)}
          onSave={(group) => void saveGroup(group)}
        />
      )}
    </>
  )
}
