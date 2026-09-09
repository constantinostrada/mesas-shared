import type { Card, Column } from '../../types/models'
import type { BoardData } from './api'
import { byPosition } from './positions'

/**
 * One change to a board, as it arrives on the board's Realtime topic.
 * DELETE only carries the id: it is all we need to drop the row.
 */
export type RemoteChange =
  | { table: 'columns'; operation: 'INSERT' | 'UPDATE'; row: Column }
  | { table: 'columns'; operation: 'DELETE'; id: string }
  | { table: 'cards'; operation: 'INSERT' | 'UPDATE'; row: Card }
  | { table: 'cards'; operation: 'DELETE'; id: string }

export type ApplyOptions = {
  /**
   * Cards with a local move still in flight. Their optimistic position stands
   * until the mutation settles, so an event does not drag the card away from
   * where the user just dropped it. Nothing is lost: the mutation invalidates
   * the board on settle, which brings back whatever the server actually holds.
   */
  pendingCardIds?: ReadonlySet<string>
}

const COLUMN_FIELDS = ['board_id', 'title', 'position'] as const
const CARD_FIELDS = [
  'column_id',
  'title',
  'description',
  'position',
  'assignee_id',
  'color',
] as const

/** created_at is deliberately not compared: it never changes. */
function sameFields<T>(a: T, b: T, fields: readonly (keyof T)[]): boolean {
  return fields.every((field) => a[field] === b[field])
}

/**
 * The board with one remote change applied. Pure, and idempotent on purpose:
 * when the change says nothing new — which is what every echo of the user's
 * own write looks like — the very same object comes back, so TanStack Query
 * does not notify and the board does not blink.
 */
export function applyRemoteChange(
  data: BoardData,
  change: RemoteChange,
  options: ApplyOptions = {},
): BoardData {
  if (change.table === 'columns') {
    if (change.operation === 'DELETE') {
      // Postgres cascades the cards; the cache should not wait for their events.
      const columns = data.columns.filter((c) => c.id !== change.id)
      const cards = data.cards.filter((c) => c.column_id !== change.id)
      if (columns.length === data.columns.length && cards.length === data.cards.length) {
        return data
      }
      return { ...data, columns, cards }
    }

    // Another board's column has no business here (the topic is per board,
    // so this is belt and braces).
    if (change.row.board_id !== data.board.id) return data

    const existing = data.columns.find((c) => c.id === change.row.id)
    if (existing && sameFields(existing, change.row, COLUMN_FIELDS)) return data
    const columns = existing
      ? data.columns.map((c) => (c.id === change.row.id ? change.row : c))
      : [...data.columns, change.row]
    return { ...data, columns: columns.sort(byPosition) }
  }

  if (change.operation === 'DELETE') {
    const cards = data.cards.filter((c) => c.id !== change.id)
    if (cards.length === data.cards.length) return data
    return { ...data, cards }
  }

  // A card whose column we don't know about is not (yet) ours to show.
  if (!data.columns.some((c) => c.id === change.row.column_id)) return data
  if (options.pendingCardIds?.has(change.row.id)) return data

  const existing = data.cards.find((c) => c.id === change.row.id)
  if (existing && sameFields(existing, change.row, CARD_FIELDS)) return data
  const cards = existing
    ? data.cards.map((c) => (c.id === change.row.id ? change.row : c))
    : [...data.cards, change.row]
  return { ...data, cards: cards.sort(byPosition) }
}

// --- parsing ---------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const nullableStr = (value: unknown): string | null | undefined =>
  value === null || typeof value === 'string' ? value : undefined

function asColumn(raw: Record<string, unknown>): Column | null {
  const id = str(raw.id)
  const board_id = str(raw.board_id)
  const title = str(raw.title)
  const position = str(raw.position)
  if (!id || !board_id || !title || !position) return null
  return { id, board_id, title, position }
}

function asCard(raw: Record<string, unknown>): Card | null {
  const id = str(raw.id)
  const column_id = str(raw.column_id)
  const title = str(raw.title)
  const position = str(raw.position)
  const assignee_id = nullableStr(raw.assignee_id)
  const color = nullableStr(raw.color)
  if (!id || !column_id || !title || !position) return null
  if (assignee_id === undefined || color === undefined) return null
  return {
    id,
    column_id,
    title,
    position,
    assignee_id,
    color,
    description: str(raw.description) ?? '',
    created_at: str(raw.created_at) ?? '',
  }
}

/**
 * The `payload` of a broadcast message from `realtime.broadcast_changes`:
 * `{ table, operation, record, old_record }`. Returns null for anything we
 * cannot use, so a malformed message is ignored instead of corrupting the
 * cache.
 */
export function parseRemoteChange(payload: unknown): RemoteChange | null {
  if (!isObject(payload)) return null
  const table = str(payload.table)
  const operation = str(payload.operation)
  if (table !== 'columns' && table !== 'cards') return null

  if (operation === 'DELETE') {
    const old = isObject(payload.old_record) ? str(payload.old_record.id) : null
    return old ? { table, operation, id: old } : null
  }
  if (operation !== 'INSERT' && operation !== 'UPDATE') return null
  if (!isObject(payload.record)) return null

  if (table === 'columns') {
    const row = asColumn(payload.record)
    return row ? { table, operation, row } : null
  }
  const row = asCard(payload.record)
  return row ? { table, operation, row } : null
}
