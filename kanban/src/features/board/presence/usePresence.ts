import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../../../auth/AuthProvider'
import { supabase } from '../../../lib/supabase'
import { createPresenceStore } from './presenceStore'
import type { PresenceStore, Roster } from './presenceStore'
import {
  moveCursor,
  parseCursorMessage,
  parseEditingMessage,
  parsePresenceState,
  setEditing,
  syncPeers,
} from './presenceState'
import type { Point } from './presenceState'
import { throttle } from './throttle'

/**
 * How often a cursor may be broadcast. 30ms caps it at ~33 messages a second
 * no matter how fast the mouse reports, which is the budget the board is held
 * to; the eye cannot tell it from every frame once the cursor is interpolated.
 */
export const CURSOR_INTERVAL_MS = 30

export type Presence = {
  /** Everyone on the board right now, self included. Re-renders only when
   *  somebody joins, leaves, or opens or closes a card. */
  roster: Roster
  /** Positions and the animation frame; the cursor layer reads this. */
  store: PresenceStore
  /** This tab's presence key — one per TAB, so two tabs are two cursors. */
  selfKey: string
  /** Report the pointer, in BOARD coordinates. Throttled inside. */
  reportCursor: (point: Point) => void
  /** Announce the card this tab has open, or null when it closes. */
  setEditingCardId: (cardId: string | null) => void
}

/** The channel, once it is joined and may actually be written to. */
type Live = {
  sendCursor: (point: Point) => void
  sendEditing: (cardId: string | null) => void
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/**
 * Who else is on this board, where their pointer is, and what they have open.
 *
 * A private channel of its own, `presence:<boardId>` — NOT the change stream
 * of phase 2. Cursors are sent by the client, which means members must be
 * allowed to write to the topic, and that is a right the change stream must
 * never grant: a member could otherwise forge a card update into everybody
 * else's board.
 */
export function usePresence(boardId: string): Presence {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const email = user?.email ?? ''

  const [selfKey] = useState(newKey)
  const store = useMemo(() => createPresenceStore(), [])
  /** Set while the channel is joined; null the rest of the time, so nothing
   *  is sent over a socket that is not there. */
  const liveRef = useRef<Live | null>(null)
  /** The card this tab has open. In a ref because whoever joins later has to
   *  be told about it, from inside the channel's own callbacks. */
  const editingRef = useRef<string | null>(null)
  /** Keys we have already announced the open card to. */
  const toldRef = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!boardId || !userId) return

    const channel = supabase.channel(`presence:${boardId}`, {
      config: { private: true, presence: { key: selfKey } },
    })

    // `sync` alone is enough: it carries the whole roster after every join
    // and every leave, and the reducer works out who is new and who is gone.
    channel.on('presence', { event: 'sync' }, () => {
      const metas = parsePresenceState(channel.presenceState())
      store.update((peers) => syncPeers(peers, metas, Date.now()))

      // Presence carries identity only, so somebody who joins after us knows
      // nothing about the card we have open. Tell the newcomers, once.
      const told = toldRef.current
      const newcomers = metas.filter((meta) => meta.key !== selfKey && !told.has(meta.key))
      toldRef.current = new Set(metas.map((meta) => meta.key))
      if (newcomers.length && editingRef.current) sendEditing(editingRef.current)
    })

    channel.on('broadcast', { event: 'cursor' }, (message: { payload?: unknown }) => {
      const cursor = parseCursorMessage(message.payload)
      if (!cursor || cursor.key === selfKey) return
      store.update((peers) => moveCursor(peers, cursor.key, cursor.point))
    })

    channel.on('broadcast', { event: 'editing' }, (message: { payload?: unknown }) => {
      const editing = parseEditingMessage(message.payload)
      if (!editing || editing.key === selfKey) return
      store.update((peers) => setEditing(peers, editing.key, editing.cardId))
    })

    const sendEditing = (cardId: string | null) => {
      if (channel.state !== 'joined') return
      void channel.send({ type: 'broadcast', event: 'editing', payload: { key: selfKey, cardId } })
    }

    // The sender lives with the channel it sends on, and dies with it: a
    // throttled call in flight when the board unmounts is cancelled here.
    const sendCursor = throttle((point: Point) => {
      if (channel.state !== 'joined') return
      void channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { key: selfKey, x: point.x, y: point.y },
      })
    }, CURSOR_INTERVAL_MS)

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        liveRef.current = null
        return
      }
      liveRef.current = { sendCursor, sendEditing }
      // Tracked exactly once, and never again on this channel: see the note on
      // PresenceMeta. Everything mutable goes out as a broadcast.
      void channel.track({ userId, email })
      // A reconnect starts from an empty roster on the other side.
      toldRef.current = new Set()
      if (editingRef.current) sendEditing(editingRef.current)
    })

    return () => {
      liveRef.current = null
      sendCursor.cancel()
      // Synchronously, and without untracking first: leaving the topic drops
      // this client's presence anyway, and `supabase.channel(topic)` hands
      // back the EXISTING channel for a topic — so a channel still in the
      // client's list when the effect runs again (StrictMode does exactly
      // that) comes back already subscribed, and binding to it throws.
      void supabase.removeChannel(channel)
    }
  }, [boardId, userId, email, selfKey, store])

  const reportCursor = useCallback((point: Point) => {
    liveRef.current?.sendCursor(point)
  }, [])

  const setEditingCardId = useCallback((cardId: string | null) => {
    if (editingRef.current === cardId) return
    editingRef.current = cardId
    liveRef.current?.sendEditing(cardId)
  }, [])

  const roster = useSyncExternalStore(store.subscribeRoster, store.getRoster)

  return { roster, store, selfKey, reportCursor, setEditingCardId }
}
