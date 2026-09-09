import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { BoardData } from '../api'
import { boardKey } from '../boardKey'
import { moveCardMutationOptions } from '../moveMutation'
import type { MoveVars } from '../moveMutation'

const card = (id: string, column_id: string, position: string) =>
  ({
    id,
    column_id,
    position,
    title: id,
    description: '',
    assignee_id: null,
    color: null,
    created_at: '2026-01-01T00:00:00Z',
  }) as BoardData['cards'][number]

const boardId = 'board-1'

function setup(mutationFn: (vars: MoveVars) => Promise<void>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const data: BoardData = {
    board: { id: boardId, name: 'B', owner_id: 'u1', created_at: '' } as BoardData['board'],
    role: 'editor',
    columns: [],
    cards: [card('A', 'col1', 'a0'), card('B', 'col1', 'a1'), card('C', 'col1', 'a2')],
    members: [],
  }
  qc.setQueryData(boardKey(boardId), data)
  const errors: string[] = []
  const observer = new MutationObserver(
    qc,
    moveCardMutationOptions(qc, boardId, (m) => errors.push(m), mutationFn),
  )
  const cards = () => (qc.getQueryData<BoardData>(boardKey(boardId)) as BoardData).cards
  const order = () => cards().map((c) => c.id)
  const moved = () => {
    const c = cards().find((x) => x.id === 'C')!
    return { column: c.column_id, position: c.position }
  }
  return { observer, errors, order, moved }
}

describe('optimistic card move', () => {
  it('moves the card in the cache before the server answers, and keeps it on success', async () => {
    let release: () => void = () => {}
    const pending = new Promise<void>((r) => (release = r))
    const { observer, order, errors } = setup(() => pending)

    const run = observer.mutate({ id: 'C', columnId: 'col1', position: 'a0V' })
    await vi.waitFor(() => expect(order()).toEqual(['A', 'C', 'B']))

    release()
    await run
    expect(order()).toEqual(['A', 'C', 'B'])
    expect(errors).toEqual([])
  })

  it('rolls back to the original position and reports the error when the update fails', async () => {
    // The request is held open so the optimistic state is observable, then fails.
    let fail: (err: Error) => void = () => {}
    const pending = new Promise<void>((_, reject) => (fail = reject))
    const { observer, order, moved, errors } = setup(() => pending)

    const run = observer.mutate({ id: 'C', columnId: 'col2', position: 'a0' }).catch(() => {})
    await vi.waitFor(() => expect(moved()).toEqual({ column: 'col2', position: 'a0' }))

    fail(new Error('Failed to fetch'))
    await run

    expect(moved()).toEqual({ column: 'col1', position: 'a2' })
    expect(order()).toEqual(['A', 'B', 'C'])
    expect(errors).toEqual(['Failed to fetch'])
  })
})
