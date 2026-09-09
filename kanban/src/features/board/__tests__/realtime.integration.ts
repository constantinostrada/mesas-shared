/**
 * End-to-end check of phase 2 against the local Supabase stack: two members
 * of a board and one outsider, real websockets, real triggers, real RLS.
 *
 * Run it with `npm run test:realtime` (it is not part of `npm test`, which
 * stays offline). Skips itself when the stack is not running.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import type { BoardData } from '../api'
import { applyRemoteChange, parseRemoteChange } from '../remoteChanges'

/** Injected by vitest.integration.config.ts; null when the stack is down. */
declare const __SUPABASE_STACK__: {
  API_URL: string
  ANON_KEY: string
  SERVICE_ROLE_KEY: string
} | null

const env = __SUPABASE_STACK__
const PASSWORD = 'realtime-check-password'
const run = Math.random().toString(36).slice(2, 8)
/** Anything slower than this is a failure: the board must feel live. */
const BUDGET_MS = 1000

type Client = SupabaseClient<Database>
type Received = { at: number; change: ReturnType<typeof parseRemoteChange> }

function sink() {
  const events: Received[] = []
  const waitFor = async (
    matches: (change: NonNullable<Received['change']>) => boolean,
    since: number,
  ): Promise<number> => {
    const deadline = Date.now() + 5000
    for (;;) {
      const hit = events.find((e) => e.change && matches(e.change))
      if (hit) return hit.at - since
      if (Date.now() > deadline) {
        throw new Error(`no matching event in 5s; got ${JSON.stringify(events.map((e) => e.change))}`)
      }
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  return { events, waitFor }
}

function listen(client: Client, boardId: string, events: Received[]) {
  const channel = client.channel(`board:${boardId}`, { config: { private: true } })
  for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
    channel.on('broadcast', { event: operation }, (message: { payload?: unknown }) => {
      events.push({ at: Date.now(), change: parseRemoteChange(message.payload) })
    })
  }
  return new Promise<{ channel: RealtimeChannel; status: string }>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        resolve({ channel, status })
      }
    })
  })
}

describe.skipIf(!env)('realtime board sync (local stack)', () => {
  if (!env) return

  const admin = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const users: string[] = []
  let owner: Client
  let member: Client
  let stranger: Client
  let boardId: string
  let columnId: string
  let secondColumnId: string
  let cardId: string
  let memberChannel: RealtimeChannel
  let strangerChannel: RealtimeChannel
  let strangerStatus = ''
  const memberSink = sink()
  const strangerSink = sink()
  /** What the member's board looks like after applying what arrived. */
  let cache: BoardData

  async function signIn(role: string): Promise<Client> {
    const email = `realtime-${role}-${run}@example.dev`
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw created.error
    users.push(created.data.user.id)
    const client = createClient<Database>(env!.API_URL, env!.ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    if (typeof WebSocket === 'undefined') {
      throw new Error('No global WebSocket: run on Node 22+, or with --experimental-websocket')
    }

    owner = await signIn('owner')
    member = await signIn('member')
    stranger = await signIn('stranger')

    const board = await owner.from('boards').insert({ name: `realtime ${run}` }).select().single()
    if (board.error) throw board.error
    boardId = board.data.id

    const membership = await owner
      .from('board_members')
      .insert({ board_id: boardId, user_id: users[1], role: 'editor' })
    if (membership.error) throw membership.error

    const columns = await owner
      .from('columns')
      .insert([
        { board_id: boardId, title: 'To do', position: 'a0' },
        { board_id: boardId, title: 'Doing', position: 'a1' },
      ])
      .select()
    if (columns.error) throw columns.error
    columnId = columns.data.find((c) => c.title === 'To do')!.id
    secondColumnId = columns.data.find((c) => c.title === 'Doing')!.id

    cache = {
      board: board.data,
      role: 'editor',
      columns: [...columns.data].sort((a, b) => (a.position < b.position ? -1 : 1)),
      cards: [],
      members: [],
    }

    const joined = await listen(member, boardId, memberSink.events)
    memberChannel = joined.channel
    expect(joined.status).toBe('SUBSCRIBED')

    const refused = await listen(stranger, boardId, strangerSink.events)
    strangerChannel = refused.channel
    strangerStatus = refused.status
  })

  afterAll(async () => {
    // No channels left behind, then no test data left behind.
    if (memberChannel) await member.removeChannel(memberChannel)
    if (strangerChannel) await stranger.removeChannel(strangerChannel)
    if (boardId) await admin.from('boards').delete().eq('id', boardId)
    for (const id of users) await admin.auth.admin.deleteUser(id)
  })

  /** Feeds everything received so far through the reducer the app uses. */
  const applyReceived = () => {
    for (const { change } of memberSink.events) {
      if (change) cache = applyRemoteChange(cache, change)
    }
    return cache
  }

  it('shows a card another user creates, in under a second', async () => {
    const t0 = Date.now()
    const created = await owner
      .from('cards')
      .insert({ column_id: columnId, title: 'Comprar café', position: 'a0' })
      .select()
      .single()
    if (created.error) throw created.error
    cardId = created.data.id

    const ms = await memberSink.waitFor(
      (c) => c.table === 'cards' && c.operation === 'INSERT' && 'row' in c && c.row.id === cardId,
      t0,
    )
    expect(ms).toBeLessThan(BUDGET_MS)
    expect(applyReceived().cards.map((c) => c.title)).toEqual(['Comprar café'])
  })

  it('shows a card another user moves to another column, in under a second', async () => {
    const t0 = Date.now()
    const moved = await owner
      .from('cards')
      .update({ column_id: secondColumnId, position: 'a5' })
      .eq('id', cardId)
    if (moved.error) throw moved.error

    const ms = await memberSink.waitFor(
      (c) =>
        c.table === 'cards' &&
        c.operation === 'UPDATE' &&
        'row' in c &&
        c.row.id === cardId &&
        c.row.column_id === secondColumnId,
      t0,
    )
    expect(ms).toBeLessThan(BUDGET_MS)
    const card = applyReceived().cards.find((c) => c.id === cardId)
    expect(card).toMatchObject({ column_id: secondColumnId, position: 'a5' })
    expect(applyReceived().cards).toHaveLength(1)
  })

  it('shows an edit another user makes, in under a second', async () => {
    const t0 = Date.now()
    const edited = await owner
      .from('cards')
      .update({ title: 'Comprar café de Colombia', color: '#00ff00' })
      .eq('id', cardId)
    if (edited.error) throw edited.error

    const ms = await memberSink.waitFor(
      (c) =>
        c.table === 'cards' &&
        c.operation === 'UPDATE' &&
        'row' in c &&
        c.row.title === 'Comprar café de Colombia',
      t0,
    )
    expect(ms).toBeLessThan(BUDGET_MS)
    expect(applyReceived().cards[0]).toMatchObject({
      title: 'Comprar café de Colombia',
      color: '#00ff00',
    })
  })

  it('ends up with the position the server kept when both users move the same card at once', async () => {
    const t0 = Date.now()
    // Two writers, no coordination: whoever Postgres serialises last wins.
    const [a, b] = await Promise.all([
      owner.from('cards').update({ column_id: columnId, position: 'b1' }).eq('id', cardId),
      member.from('cards').update({ column_id: secondColumnId, position: 'b2' }).eq('id', cardId),
    ])
    if (a.error) throw a.error
    if (b.error) throw b.error

    // Both moves must have been broadcast before we compare.
    await memberSink.waitFor(
      (c) => c.table === 'cards' && c.operation === 'UPDATE' && 'row' in c && c.row.position === 'b1',
      t0,
    )
    await memberSink.waitFor(
      (c) => c.table === 'cards' && c.operation === 'UPDATE' && 'row' in c && c.row.position === 'b2',
      t0,
    )

    const stored = await owner.from('cards').select('*').eq('id', cardId).single()
    if (stored.error) throw stored.error

    const applied = applyReceived().cards.filter((c) => c.id === cardId)
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      column_id: stored.data.column_id,
      position: stored.data.position,
    })
  })

  it('removes a card another user deletes, in under a second', async () => {
    const t0 = Date.now()
    const deleted = await owner.from('cards').delete().eq('id', cardId)
    if (deleted.error) throw deleted.error

    const ms = await memberSink.waitFor(
      (c) => c.table === 'cards' && c.operation === 'DELETE' && 'id' in c && c.id === cardId,
      t0,
    )
    expect(ms).toBeLessThan(BUDGET_MS)
    expect(applyReceived().cards).toEqual([])
  })

  it('reflects columns another user adds, renames and deletes', async () => {
    const t0 = Date.now()
    const created = await owner
      .from('columns')
      .insert({ board_id: boardId, title: 'Done', position: 'a2' })
      .select()
      .single()
    if (created.error) throw created.error

    await memberSink.waitFor(
      (c) => c.table === 'columns' && c.operation === 'INSERT' && 'row' in c && c.row.id === created.data.id,
      t0,
    )
    expect(applyReceived().columns.map((c) => c.title)).toEqual(['To do', 'Doing', 'Done'])

    await owner.from('columns').update({ title: 'Terminado' }).eq('id', created.data.id)
    await memberSink.waitFor(
      (c) => c.table === 'columns' && c.operation === 'UPDATE' && 'row' in c && c.row.title === 'Terminado',
      t0,
    )
    expect(applyReceived().columns.map((c) => c.title)).toEqual(['To do', 'Doing', 'Terminado'])

    await owner.from('columns').delete().eq('id', created.data.id)
    await memberSink.waitFor(
      (c) => c.table === 'columns' && c.operation === 'DELETE' && 'id' in c && c.id === created.data.id,
      t0,
    )
    expect(applyReceived().columns.map((c) => c.title)).toEqual(['To do', 'Doing'])
  })

  it('tells a non-member nothing at all — not even what was deleted', () => {
    // The topic is private: authorization happens when the channel is joined,
    // which is the only way to also cover DELETE (Realtime cannot apply RLS
    // to a row that no longer exists).
    expect(strangerStatus).toBe('CHANNEL_ERROR')
    expect(strangerSink.events).toEqual([])
  })
})
