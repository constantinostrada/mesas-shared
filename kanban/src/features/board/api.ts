import { supabase } from '../../lib/supabase'
import type { Board, BoardRole, Card, Column, MemberProfile } from '../../types/models'
import { byPosition } from './positions'

export type BoardData = {
  board: Board
  role: BoardRole | null
  columns: Column[]
  /** All cards of the board, sorted by position. */
  cards: Card[]
  members: MemberProfile[]
}

export async function fetchBoardData(boardId: string): Promise<BoardData> {
  const [boardRes, roleRes, columnsRes, membersRes] = await Promise.all([
    supabase.from('boards').select('*').eq('id', boardId).single(),
    supabase.rpc('board_role', { p_board_id: boardId }),
    supabase.from('columns').select('*').eq('board_id', boardId),
    supabase.rpc('board_member_profiles', { p_board_id: boardId }),
  ])
  if (boardRes.error) throw boardRes.error
  if (roleRes.error) throw roleRes.error
  if (columnsRes.error) throw columnsRes.error
  if (membersRes.error) throw membersRes.error

  const columns = [...columnsRes.data].sort(byPosition)
  const columnIds = columns.map((c) => c.id)

  let cards: Card[] = []
  if (columnIds.length) {
    const cardsRes = await supabase.from('cards').select('*').in('column_id', columnIds)
    if (cardsRes.error) throw cardsRes.error
    cards = [...cardsRes.data].sort(byPosition)
  }

  return {
    board: boardRes.data,
    role: roleRes.data,
    columns,
    cards,
    members: membersRes.data ?? [],
  }
}

// --- columns ---------------------------------------------------------------

export async function createColumn(
  boardId: string,
  title: string,
  position: string,
): Promise<Column> {
  const { data, error } = await supabase
    .from('columns')
    .insert({ board_id: boardId, title, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameColumn(id: string, title: string): Promise<void> {
  const { error, count } = await supabase
    .from('columns')
    .update({ title }, { count: 'exact' })
    .eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('No tenés permiso para editar esta columna')
}

export async function deleteColumn(id: string): Promise<void> {
  const { error, count } = await supabase
    .from('columns')
    .delete({ count: 'exact' })
    .eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('No tenés permiso para borrar esta columna')
}

// --- cards -----------------------------------------------------------------

export type CardDraft = {
  title: string
  description: string
  color: string | null
  assignee_id: string | null
}

export async function createCard(
  columnId: string,
  draft: CardDraft,
  position: string,
): Promise<Card> {
  const { data, error } = await supabase
    .from('cards')
    .insert({ column_id: columnId, position, ...draft })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCard(id: string, draft: Partial<CardDraft>): Promise<void> {
  const { error, count } = await supabase
    .from('cards')
    .update(draft, { count: 'exact' })
    .eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('No tenés permiso para editar esta card')
}

export async function deleteCard(id: string): Promise<void> {
  const { error, count } = await supabase.from('cards').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('No tenés permiso para borrar esta card')
}

/**
 * Move a card: ONE row updated, thanks to the fractional index. The new
 * position is computed on the client from the neighbours at the drop site.
 */
export async function moveCard(
  id: string,
  columnId: string,
  position: string,
): Promise<void> {
  const { error, count } = await supabase
    .from('cards')
    .update({ column_id: columnId, position }, { count: 'exact' })
    .eq('id', id)
  if (error) throw error
  if (count === 0) throw new Error('No tenés permiso para mover esta card')
}
