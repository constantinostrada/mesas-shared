/**
 * End-to-end check of phase 3 against the local Supabase stack: two members
 * of a board on the presence topic, one outsider, real websockets, real RLS.
 *
 * Run it with `npm run test:realtime` (it is not part of `npm test`, which
 * stays offline). Skips itself when the stack is not running.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/database'
import { parseRemoteChange } from '../remoteChanges'
import {
  NO_PEERS,
  editorsByCard,
  moveCursor,
  parseCursorMessage,
  parseEditingMessage,
  parsePresenceState,
  setEditing,
  syncPeers,
} from '../presence/presenceState'
import type { Peers } from '../presence/presenceState'

/** Injected by vitest.integration.config.ts; null when the stack is down. */
declare const __SUPABASE_STACK__: {
  API_URL: string
  ANON_KEY: string
  SERVICE_ROLE_KEY: string
} | null

const env = __SUPABASE_STACK__
const PASSWORD = 'presence-check-password'
const run = Math.random().toString(36).slice(2, 8)

type Client = SupabaseClient<Database>

async function until<T>(what: string, probe: () => T | null | undefined, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

const join = (channel: RealtimeChannel) =>
  new Promise<string>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        resolve(status)
      }
    })
  })

describe.skipIf(!env)('board presence (local stack)', () => {
  if (!env) return

  const admin = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const users: string[] = []
  let owner: Client
  let member: Client
  let stranger: Client
  let boardId: string
  let cardId: string
  let ownerChannel: RealtimeChannel
  let memberChannel: RealtimeChannel
  let strangerChannel: RealtimeChannel
  let strangerStatus = ''

  const OWNER_TAB = 'tab-owner'
  const MEMBER_TAB = 'tab-member'

  /** What the member's screen would show, fed by the app's own reducers. */
  let peers: Peers = NO_PEERS

  async function signIn(role: string): Promise<Client> {
    const email = `presence-${role}-${run}@example.dev`
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

  function presenceChannel(client: Client, key: string): RealtimeChannel {
    return client.channel(`presence:${boardId}`, {
      config: { private: true, presence: { key } },
    })
  }

  beforeAll(async () => {
    if (typeof WebSocket === 'undefined') {
      throw new Error('No global WebSocket: run on Node 22+, or with --experimental-websocket')
    }

    owner = await signIn('owner')
    member = await signIn('member')
    stranger = await signIn('stranger')

    const board = await owner.from('boards').insert({ name: `presence ${run}` }).select().single()
    if (board.error) throw board.error
    boardId = board.data.id

    const membership = await owner
      .from('board_members')
      .insert({ board_id: boardId, user_id: users[1], role: 'editor' })
    if (membership.error) throw membership.error

    const column = await owner
      .from('columns')
      .insert({ board_id: boardId, title: 'To do', position: 'a0' })
      .select()
      .single()
    if (column.error) throw column.error
    const card = await owner
      .from('cards')
      .insert({ column_id: column.data.id, title: 'Comprar café', position: 'a0' })
      .select()
      .single()
    if (card.error) throw card.error
    cardId = card.data.id

    // The member watches, exactly the way the hook does.
    memberChannel = presenceChannel(member, MEMBER_TAB)
    memberChannel.on('presence', { event: 'sync' }, () => {
      peers = syncPeers(peers, parsePresenceState(memberChannel.presenceState()), Date.now())
    })
    memberChannel.on('broadcast', { event: 'cursor' }, (message: { payload?: unknown }) => {
      const cursor = parseCursorMessage(message.payload)
      if (!cursor || cursor.key === MEMBER_TAB) return
      peers = moveCursor(peers, cursor.key, cursor.point)
    })
    memberChannel.on('broadcast', { event: 'editing' }, (message: { payload?: unknown }) => {
      const editing = parseEditingMessage(message.payload)
      if (!editing || editing.key === MEMBER_TAB) return
      peers = setEditing(peers, editing.key, editing.cardId)
    })
    expect(await join(memberChannel)).toBe('SUBSCRIBED')
    await memberChannel.track({
      userId: users[1],
      email: `presence-member-${run}@example.dev`,
    })

    ownerChannel = presenceChannel(owner, OWNER_TAB)
    expect(await join(ownerChannel)).toBe('SUBSCRIBED')

    strangerChannel = presenceChannel(stranger, 'tab-stranger')
    strangerStatus = await join(strangerChannel)
  })

  afterAll(async () => {
    for (const [client, channel] of [
      [member, memberChannel],
      [stranger, strangerChannel],
    ] as const) {
      if (channel) await client.removeChannel(channel)
    }
    if (boardId) await admin.from('boards').delete().eq('id', boardId)
    for (const id of users) await admin.auth.admin.deleteUser(id)
  })

  it('shows the avatar of whoever else opens the board', async () => {
    await ownerChannel.track({ userId: users[0], email: `presence-owner-${run}@example.dev` })

    const peer = await until('the owner to appear', () => peers[OWNER_TAB])
    expect(peer.userId).toBe(users[0])
    expect(peer.leftAt).toBeNull()
    // The colour is derived, never exchanged: both screens compute the same.
    expect(peer.color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('carries the cursor of the other user, in board coordinates', async () => {
    await ownerChannel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { key: OWNER_TAB, x: 431.5, y: 208 },
    })

    const at = await until('the cursor', () => peers[OWNER_TAB]?.at)
    expect(at).toEqual({ x: 431.5, y: 208 })
  })

  it('outlines the card the other user has open, and clears it when they close it', async () => {
    const announce = (id: string | null) =>
      ownerChannel.send({ type: 'broadcast', event: 'editing', payload: { key: OWNER_TAB, cardId: id } })

    await announce(cardId)
    const editor = await until('the editing flag', () =>
      editorsByCard(Object.values(peers), MEMBER_TAB).get(cardId),
    )
    expect(editor.userId).toBe(users[0])

    await announce(null)
    await until('the editing flag to clear', () =>
      editorsByCard(Object.values(peers), MEMBER_TAB).get(cardId) ? null : true,
    )

    // Left open again, so the next test can check it is dropped on leave.
    await announce(cardId)
    await until('the editing flag again', () =>
      editorsByCard(Object.values(peers), MEMBER_TAB).get(cardId),
    )
  })

  it('marks the other user as gone when they close the tab, instead of freezing', async () => {
    // What closing the tab does: leave the topic. No untrack first — see the
    // note in usePresence's cleanup.
    await owner.removeChannel(ownerChannel)
    const leftAt = await until('the owner to leave', () => peers[OWNER_TAB]?.leftAt)
    expect(leftAt).toBeGreaterThan(0)
    // The cursor is still there for the fade, but nobody is holding a card.
    expect(peers[OWNER_TAB].at).toEqual({ x: 431.5, y: 208 })
    expect(editorsByCard(Object.values(peers), MEMBER_TAB).size).toBe(0)
  })

  it('does not let a non-member watch the board’s cursors', () => {
    expect(strangerStatus).toBe('CHANNEL_ERROR')
  })

  it('does not let a member forge a change on the read-only change topic', async () => {
    // Why presence lives on its own topic: members must be able to WRITE to
    // send cursors, and that right must never reach the change stream, where
    // a forged payload would be applied to everyone's board as if the
    // database had sent it.
    const received: unknown[] = []
    const listener = member.channel(`board:${boardId}`, { config: { private: true } })
    listener.on('broadcast', { event: 'INSERT' }, (message: { payload?: unknown }) => {
      received.push(parseRemoteChange(message.payload))
    })
    expect(await join(listener)).toBe('SUBSCRIBED')

    const forger = owner.channel(`board:${boardId}`, { config: { private: true } })
    expect(await join(forger)).toBe('SUBSCRIBED')
    await forger.send({
      type: 'broadcast',
      event: 'INSERT',
      payload: {
        table: 'cards',
        operation: 'INSERT',
        record: { id: 'ffffffff-0000-0000-0000-000000000001', column_id: 'x', title: 'falsa', position: 'a0' },
      },
    })

    await new Promise((r) => setTimeout(r, 1500))
    expect(received).toEqual([])

    await member.removeChannel(listener)
    await owner.removeChannel(forger)
  })
})
