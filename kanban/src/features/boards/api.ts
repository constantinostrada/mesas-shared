import { supabase } from '../../lib/supabase'
import type { Board, BoardRole } from '../../types/models'

export type BoardWithRole = Board & { role: BoardRole }

/** Boards the current user is a member of (RLS already filters), with role. */
export async function fetchBoards(userId: string): Promise<BoardWithRole[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*, board_members!inner(role, user_id)')
    .eq('board_members.user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(({ board_members, ...board }) => ({
    ...board,
    role: board_members[0]?.role ?? 'viewer',
  }))
}

export async function createBoard(name: string): Promise<Board> {
  // owner_id defaults to auth.uid(); the trigger adds the owner membership.
  const { data, error } = await supabase.from('boards').insert({ name }).select().single()
  if (error) throw error
  return data
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('boards').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteBoard(id: string): Promise<void> {
  const { error, count } = await supabase
    .from('boards')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw error
  // RLS silently filters rows the user may not delete; surface that.
  if (count === 0) throw new Error('No tenés permiso para borrar este board')
}
