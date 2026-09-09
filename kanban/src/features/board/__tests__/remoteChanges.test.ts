import { describe, expect, it } from 'vitest'
import type { Card, Column } from '../../../types/models'
import type { BoardData } from '../api'
import { applyRemoteChange, parseRemoteChange } from '../remoteChanges'

const boardId = 'board-1'

const column = (id: string, position: string): Column => ({
  id,
  board_id: boardId,
  title: id,
  position,
})

const card = (id: string, column_id: string, position: string, extra: Partial<Card> = {}): Card => ({
  id,
  column_id,
  position,
  title: id,
  description: '',
  assignee_id: null,
  color: null,
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
})

const board = (): BoardData => ({
  board: { id: boardId, name: 'B', owner_id: 'u1', created_at: '' },
  role: 'editor',
  columns: [column('col1', 'a0'), column('col2', 'a1')],
  cards: [card('A', 'col1', 'a0'), card('B', 'col1', 'a1'), card('C', 'col2', 'a0')],
  members: [],
})

const ids = (data: BoardData, columnId: string) =>
  data.cards.filter((c) => c.column_id === columnId).map((c) => c.id)

/** The payload shape `realtime.broadcast_changes` sends. */
const payload = (
  table: string,
  operation: string,
  record: unknown,
  old_record: unknown = null,
) => ({ id: 'msg-1', schema: 'public', table, operation, record, old_record })

describe('applyRemoteChange — cards', () => {
  it('inserts a card someone else created, in position order', () => {
    const next = applyRemoteChange(board(), {
      table: 'cards',
      operation: 'INSERT',
      row: card('N', 'col1', 'a0V'),
    })
    expect(ids(next, 'col1')).toEqual(['A', 'N', 'B'])
  })

  it('moves a card someone else moved, across columns', () => {
    const next = applyRemoteChange(board(), {
      table: 'cards',
      operation: 'UPDATE',
      row: card('A', 'col2', 'a1'),
    })
    expect(ids(next, 'col1')).toEqual(['B'])
    expect(ids(next, 'col2')).toEqual(['C', 'A'])
  })

  it('applies an edit of the fields the board shows', () => {
    const next = applyRemoteChange(board(), {
      table: 'cards',
      operation: 'UPDATE',
      row: card('A', 'col1', 'a0', { title: 'renamed', color: '#ff0000' }),
    })
    expect(next.cards.find((c) => c.id === 'A')).toMatchObject({
      title: 'renamed',
      color: '#ff0000',
    })
  })

  it('removes a card someone else deleted', () => {
    const next = applyRemoteChange(board(), { table: 'cards', operation: 'DELETE', id: 'B' })
    expect(ids(next, 'col1')).toEqual(['A'])
  })

  it('returns the very same board when the change says nothing new', () => {
    // This is the user's own write coming back: same row, already in cache.
    const data = board()
    const echo = applyRemoteChange(data, {
      table: 'cards',
      operation: 'UPDATE',
      row: card('A', 'col1', 'a0', { created_at: 'a-different-timestamp-format' }),
    })
    expect(echo).toBe(data)

    const goneAlready = applyRemoteChange(data, {
      table: 'cards',
      operation: 'DELETE',
      id: 'not-here',
    })
    expect(goneAlready).toBe(data)
  })

  it('ignores a card whose column is not in the board', () => {
    const data = board()
    expect(
      applyRemoteChange(data, {
        table: 'cards',
        operation: 'INSERT',
        row: card('X', 'column-of-another-board', 'a0'),
      }),
    ).toBe(data)
  })

  it('leaves a card alone while the local move for it is in flight', () => {
    const data = board()
    const remote = applyRemoteChange(
      data,
      { table: 'cards', operation: 'UPDATE', row: card('A', 'col2', 'a9') },
      { pendingCardIds: new Set(['A']) },
    )
    expect(remote).toBe(data)
  })

  it('still applies a remote change to other cards while one is in flight', () => {
    const next = applyRemoteChange(
      board(),
      { table: 'cards', operation: 'UPDATE', row: card('B', 'col2', 'a9') },
      { pendingCardIds: new Set(['A']) },
    )
    expect(ids(next, 'col2')).toEqual(['C', 'B'])
  })

  it('does not duplicate a card when the same move arrives twice', () => {
    const move = { table: 'cards', operation: 'UPDATE', row: card('A', 'col2', 'a1') } as const
    const once = applyRemoteChange(board(), move)
    const twice = applyRemoteChange(once, move)
    expect(twice).toBe(once)
    expect(twice.cards.filter((c) => c.id === 'A')).toHaveLength(1)
  })

  it('converges on the position the server kept when two moves race', () => {
    // Two users move A at the same time; the events arrive in the order the
    // server wrote them, so the last one is the position that persisted.
    let data = applyRemoteChange(board(), {
      table: 'cards',
      operation: 'UPDATE',
      row: card('A', 'col2', 'a0V'),
    })
    data = applyRemoteChange(data, {
      table: 'cards',
      operation: 'UPDATE',
      row: card('A', 'col1', 'a2'),
    })
    expect(data.cards.filter((c) => c.id === 'A')).toHaveLength(1)
    expect(ids(data, 'col1')).toEqual(['B', 'A'])
    expect(ids(data, 'col2')).toEqual(['C'])
  })
})

describe('applyRemoteChange — columns', () => {
  it('inserts and renames columns in position order', () => {
    let data = applyRemoteChange(board(), {
      table: 'columns',
      operation: 'INSERT',
      row: column('col3', 'a0V'),
    })
    expect(data.columns.map((c) => c.id)).toEqual(['col1', 'col3', 'col2'])

    data = applyRemoteChange(data, {
      table: 'columns',
      operation: 'UPDATE',
      row: { ...column('col3', 'a0V'), title: 'Doing' },
    })
    expect(data.columns.find((c) => c.id === 'col3')?.title).toBe('Doing')
  })

  it('drops the cards of a deleted column without waiting for their events', () => {
    const next = applyRemoteChange(board(), {
      table: 'columns',
      operation: 'DELETE',
      id: 'col1',
    })
    expect(next.columns.map((c) => c.id)).toEqual(['col2'])
    expect(next.cards.map((c) => c.id)).toEqual(['C'])
  })

  it('ignores a column of another board', () => {
    const data = board()
    expect(
      applyRemoteChange(data, {
        table: 'columns',
        operation: 'INSERT',
        row: { ...column('col9', 'a2'), board_id: 'another-board' },
      }),
    ).toBe(data)
  })
})

describe('parseRemoteChange', () => {
  it('reads an insert, an update and a delete', () => {
    const row = { id: 'A', column_id: 'col1', title: 'A', position: 'a0', description: 'd', assignee_id: null, color: null, created_at: 'now' }
    expect(parseRemoteChange(payload('cards', 'INSERT', row))).toEqual({
      table: 'cards',
      operation: 'INSERT',
      row: { ...row, created_at: 'now' },
    })
    expect(parseRemoteChange(payload('cards', 'DELETE', null, row))).toEqual({
      table: 'cards',
      operation: 'DELETE',
      id: 'A',
    })
    expect(
      parseRemoteChange(payload('columns', 'UPDATE', { id: 'c1', board_id: boardId, title: 'T', position: 'a0' })),
    ).toEqual({
      table: 'columns',
      operation: 'UPDATE',
      row: { id: 'c1', board_id: boardId, title: 'T', position: 'a0' },
    })
  })

  it('rejects anything it cannot use instead of corrupting the cache', () => {
    expect(parseRemoteChange(null)).toBeNull()
    expect(parseRemoteChange(payload('boards', 'INSERT', { id: 'b' }))).toBeNull()
    expect(parseRemoteChange(payload('cards', 'TRUNCATE', { id: 'A' }))).toBeNull()
    expect(parseRemoteChange(payload('cards', 'INSERT', null))).toBeNull()
    expect(parseRemoteChange(payload('cards', 'INSERT', { id: 'A', title: 'A' }))).toBeNull()
    expect(parseRemoteChange(payload('cards', 'DELETE', null, {}))).toBeNull()
    expect(
      parseRemoteChange(payload('cards', 'INSERT', { id: 'A', column_id: 'c', title: 'A', position: 'a0', assignee_id: 7 })),
    ).toBeNull()
  })
})
