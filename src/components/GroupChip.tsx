/**
 * One group in the desktop group bar. Long-press opens the group menu; a plain
 * click/tap selects it. Long-press timing mirrors DepartureCard's drag gesture
 * (120ms, 10px-move cancel) — no drag follows here, just a menu open.
 */

import { useRef } from 'react'
import type { Group } from '../../shared/types.ts'

type Props = {
  group: Group
  isActive: boolean
  onSelect: () => void
  onLongPress: () => void
}

export function GroupChip({ group, isActive, onSelect, onLongPress }: Props) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const firedRef = useRef(false)

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    startPos.current = { x: e.clientX, y: e.clientY }
    firedRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      firedRef.current = true
      onLongPress()
    }, 120)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
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
    <button
      type="button"
      className="group-chip"
      data-group-id={group.id}
      data-active={isActive || undefined}
      aria-pressed={isActive}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!firedRef.current) onSelect() }}
    >
      {group.name}
    </button>
  )
}
