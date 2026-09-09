import type { Database } from './database'

type Tables = Database['public']['Tables']

export type Board = Tables['boards']['Row']
export type BoardMember = Tables['board_members']['Row']
export type Column = Tables['columns']['Row']
export type Card = Tables['cards']['Row']
export type BoardRole = Database['public']['Enums']['board_role']

export type MemberProfile =
  Database['public']['Functions']['board_member_profiles']['Returns'][number]

export const canEdit = (role: BoardRole | null | undefined): boolean =>
  role === 'owner' || role === 'editor'
