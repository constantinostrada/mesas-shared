import type { QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { Card } from '../../types/models'
import type { BoardData } from './api'
import { boardKey } from './boardKey'
import { byPosition } from './positions'

export type MoveVars = { id: string; columnId: string; position: string }
type Context = { previous: BoardData | undefined }

export const moveMutationKey = (boardId: string) => ['move-card', boardId] as const

/**
 * Cards this client is currently moving. Read from the mutation cache rather
 * than kept in a variable of its own, so it cannot drift from the mutations
 * that are really in flight. A remote change for one of these cards is left
 * for the refetch that follows the move (see `applyRemoteChange`).
 */
export function pendingMoveCardIds(qc: QueryClient, boardId: string): ReadonlySet<string> {
  const ids = new Set<string>()
  const pending = qc
    .getMutationCache()
    .findAll({ mutationKey: moveMutationKey(boardId), status: 'pending' })
  for (const mutation of pending) {
    const vars = mutation.state.variables as MoveVars | undefined
    if (vars?.id) ids.add(vars.id)
  }
  return ids
}

/**
 * Optimistic move: the card jumps to its destination in the cache before the
 * request leaves. If the update fails (offline, viewer role, race), the
 * previous snapshot is restored and the error is reported.
 *
 * Kept out of the hook so it can be exercised without React.
 */
export function moveCardMutationOptions(
  qc: QueryClient,
  boardId: string,
  onErrorMessage: (message: string) => void,
  /** Injected so the optimistic/rollback behaviour is testable without network. */
  mutationFn: (vars: MoveVars) => Promise<void>,
): UseMutationOptions<void, unknown, MoveVars, Context> {
  const key = boardKey(boardId)
  return {
    mutationKey: moveMutationKey(boardId),
    mutationFn,
    onMutate: async ({ id, columnId, position }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<BoardData>(key)
      if (previous) {
        const cards: Card[] = previous.cards
          .map((c) => (c.id === id ? { ...c, column_id: columnId, position } : c))
          .sort(byPosition)
        qc.setQueryData<BoardData>(key, { ...previous, cards })
      }
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous)
      onErrorMessage(err instanceof Error ? err.message : String(err))
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
    },
  }
}
