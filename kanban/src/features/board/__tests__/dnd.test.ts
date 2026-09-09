import { describe, expect, it } from 'vitest'
import type { Card } from '../../../types/models'
import { resolveMove, columnDroppableId } from '../dnd'
import { byPosition, positionAfterLast, positionAtIndex } from '../positions'

const card = (id: string, column_id: string, position: string): Card =>
  ({
    id,
    column_id,
    position,
    title: id,
    description: '',
    assignee_id: null,
    color: null,
    created_at: '2026-01-01T00:00:00Z',
  }) as Card

/** Order of a column after applying a move, the way the optimistic cache does. */
const orderAfter = (cards: Card[], id: string, columnId: string, position: string) =>
  cards
    .map((c) => (c.id === id ? { ...c, column_id: columnId, position } : c))
    .filter((c) => c.column_id === columnId)
    .sort(byPosition)
    .map((c) => c.id)

describe('positions', () => {
  it('appends after the last item', () => {
    const items = [{ position: 'a0' }, { position: 'a1' }]
    expect(positionAfterLast(items) > 'a1').toBe(true)
    expect(positionAfterLast([])).toBe('a0')
  })

  it('produces a key strictly between two neighbours', () => {
    const items = [{ position: 'a0' }, { position: 'a1' }]
    const p = positionAtIndex(items, 1)
    expect(p > 'a0').toBe(true)
    expect(p < 'a1').toBe(true)
  })
})

describe('resolveMove', () => {
  const cards = [
    card('A', 'col1', 'a0'),
    card('B', 'col1', 'a1'),
    card('C', 'col1', 'a2'),
    card('D', 'col2', 'a0'),
  ]

  it('moves a card down inside its column, after the card it was dropped on', () => {
    const move = resolveMove(cards, 'A', 'B')!
    expect(move.columnId).toBe('col1')
    expect(orderAfter(cards, 'A', move.columnId, move.position)).toEqual(['B', 'A', 'C'])
  })

  it('moves a card up inside its column, before the card it was dropped on', () => {
    const move = resolveMove(cards, 'C', 'B')!
    expect(orderAfter(cards, 'C', move.columnId, move.position)).toEqual(['A', 'C', 'B'])
  })

  it('drops between two existing cards without touching their positions', () => {
    const move = resolveMove(cards, 'D', 'C')!
    expect(move.columnId).toBe('col1')
    expect(move.position > 'a1').toBe(true)
    expect(move.position < 'a2').toBe(true)
    expect(orderAfter(cards, 'D', move.columnId, move.position)).toEqual(['A', 'B', 'D', 'C'])
  })

  it('moves a card to another column, at the end when dropped on the column', () => {
    const move = resolveMove(cards, 'A', columnDroppableId('col2'))!
    expect(move.columnId).toBe('col2')
    expect(orderAfter(cards, 'A', move.columnId, move.position)).toEqual(['D', 'A'])
  })

  it('moves into an empty column', () => {
    const move = resolveMove(cards, 'A', columnDroppableId('col3'))!
    expect(move.columnId).toBe('col3')
    expect(orderAfter(cards, 'A', move.columnId, move.position)).toEqual(['A'])
  })

  it('returns null when the card is dropped on itself or in its own slot', () => {
    expect(resolveMove(cards, 'A', 'A')).toBeNull()
    expect(resolveMove(cards, 'B', columnDroppableId('col2'))).not.toBeNull()
    expect(resolveMove(cards, 'D', columnDroppableId('col2'))).toBeNull()
  })

  it('ignores unknown ids', () => {
    expect(resolveMove(cards, 'nope', 'A')).toBeNull()
    expect(resolveMove(cards, 'A', 'nope')).toBeNull()
  })
})
