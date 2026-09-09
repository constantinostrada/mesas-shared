import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { createBoard, deleteBoard, fetchBoards, renameBoard } from './api'

export const boardsKey = (userId: string) => ['boards', userId] as const

export function useBoards() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  return useQuery({
    queryKey: boardsKey(userId),
    queryFn: () => fetchBoards(userId),
    enabled: Boolean(userId),
  })
}

export function useBoardMutations() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: boardsKey(user?.id ?? '') })

  const create = useMutation({ mutationFn: createBoard, onSettled: invalidate })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameBoard(id, name),
    onSettled: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteBoard, onSettled: invalidate })

  return { create, rename, remove }
}
