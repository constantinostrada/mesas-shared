import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import {
  createCard,
  createColumn,
  deleteCard,
  deleteColumn,
  fetchBoardData,
  moveCard,
  renameColumn,
  updateCard,
} from './api'
import type { CardDraft } from './api'
import { boardKey } from './boardKey'
import { moveCardMutationOptions } from './moveMutation'

export { boardKey }

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKey(boardId),
    queryFn: () => fetchBoardData(boardId),
    enabled: Boolean(boardId),
  })
}

export function useBoardMutations(boardId: string) {
  const qc = useQueryClient()
  const toast = useToast()
  const key = boardKey(boardId)
  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const onError = (err: unknown) => toast.error(errorMessage(err))

  const addColumn = useMutation({
    mutationFn: ({ title, position }: { title: string; position: string }) =>
      createColumn(boardId, title, position),
    onError,
    onSettled: invalidate,
  })

  const editColumn = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameColumn(id, title),
    onError,
    onSettled: invalidate,
  })

  const removeColumn = useMutation({
    mutationFn: (id: string) => deleteColumn(id),
    onError,
    onSettled: invalidate,
  })

  const addCard = useMutation({
    mutationFn: ({
      columnId,
      draft,
      position,
    }: {
      columnId: string
      draft: CardDraft
      position: string
    }) => createCard(columnId, draft, position),
    onError,
    onSettled: invalidate,
  })

  const editCard = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: Partial<CardDraft> }) =>
      updateCard(id, draft),
    onError,
    onSettled: invalidate,
  })

  const removeCard = useMutation({
    mutationFn: (id: string) => deleteCard(id),
    onError,
    onSettled: invalidate,
  })

  const move = useMutation(
    moveCardMutationOptions(
      qc,
      boardId,
      (message) => toast.error(`No se pudo mover la card: ${message}`),
      ({ id, columnId, position }) => moveCard(id, columnId, position),
    ),
  )

  return { addColumn, editColumn, removeColumn, addCard, editCard, removeCard, move }
}
