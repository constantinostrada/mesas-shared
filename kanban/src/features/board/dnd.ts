import type { Card } from '../../types/models'
import { byPosition, positionAtIndex } from './positions'

export const columnDroppableId = (columnId: string) => `column:${columnId}`
export const isColumnDroppableId = (id: string) => id.startsWith('column:')
export const columnIdFromDroppable = (id: string) => id.slice('column:'.length)

export type Move = { columnId: string; position: string }

/**
 * Where a dragged card lands, and the fractional position that puts it there.
 * `over` is either a card id or a column droppable id. Returns null when the
 * card would not actually move (same slot), so no request is sent.
 */
export function resolveMove(cards: Card[], activeId: string, overId: string): Move | null {
  const active = cards.find((c) => c.id === activeId)
  if (!active) return null

  const targetColumnId = isColumnDroppableId(overId)
    ? columnIdFromDroppable(overId)
    : cards.find((c) => c.id === overId)?.column_id
  if (!targetColumnId) return null

  const inTarget = cards.filter((c) => c.column_id === targetColumnId).sort(byPosition)
  const others = inTarget.filter((c) => c.id !== activeId)

  let index: number
  if (isColumnDroppableId(overId)) {
    index = others.length
  } else {
    const overIndex = others.findIndex((c) => c.id === overId)
    if (overIndex === -1) return null
    const sameColumn = active.column_id === targetColumnId
    const movingDown = sameColumn && active.position < (inTarget.find((c) => c.id === overId)?.position ?? '')
    index = movingDown ? overIndex + 1 : overIndex
  }

  // Already sitting in that slot? Nothing to write.
  const currentIndex = inTarget.findIndex((c) => c.id === activeId)
  if (active.column_id === targetColumnId && currentIndex === index) return null
  const prev = index > 0 ? others[index - 1] : null
  if (prev?.id === activeId) return null

  return { columnId: targetColumnId, position: positionAtIndex(others, index) }
}
