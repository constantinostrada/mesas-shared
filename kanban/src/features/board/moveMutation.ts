import type { QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { Card } from '../../types/models'
import type { BoardData } from './api'
import { boardKey } from './boardKey'
import { byPosition } from './positions'

export type MoveVars = { id: string; columnId: string; position: string }
type Context = { previous: BoardData | undefined }

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
