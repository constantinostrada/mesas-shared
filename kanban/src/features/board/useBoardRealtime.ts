import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { BoardData } from './api'
import { boardKey } from './boardKey'
import { pendingMoveCardIds } from './moveMutation'
import { applyRemoteChange, parseRemoteChange } from './remoteChanges'

const OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'] as const

/**
 * Keeps the board in sync with what everyone else is doing.
 *
 * One private channel per board: the database broadcasts every change to
 * columns and cards on the topic `board:<id>`, and only members of that board
 * are allowed to read it (the check happens when the channel is joined, so it
 * covers deletes too — Realtime cannot apply RLS to those).
 *
 * Events patch the cached board in place. The board is refetched only when the
 * channel (re)joins, because changes made while the socket was down were never
 * delivered and are the one thing a patch cannot recover.
 */
export function useBoardRealtime(boardId: string): void {
  const qc = useQueryClient()

  useEffect(() => {
    if (!boardId) return

    const key = boardKey(boardId)
    const resync = () => void qc.invalidateQueries({ queryKey: key })

    const channel: RealtimeChannel = supabase.channel(`board:${boardId}`, {
      config: { private: true },
    })

    const onChange = (message: { payload?: unknown }) => {
      const change = parseRemoteChange(message.payload)
      if (!change) return
      qc.setQueryData<BoardData>(key, (data) =>
        data
          ? applyRemoteChange(data, change, { pendingCardIds: pendingMoveCardIds(qc, boardId) })
          : data,
      )
    }

    for (const operation of OPERATIONS) {
      channel.on('broadcast', { event: operation }, onChange)
    }

    channel.subscribe((status) => {
      // Also fires on the first join, which closes the gap between the initial
      // fetch and the subscription being live.
      if (status === 'SUBSCRIBED') resync()
    })

    // The socket reconnects on its own, but waking from a dead network can sit
    // in the backoff for a while; this shortens it.
    const onOnline = () => {
      if (channel.state === 'joined') resync()
      else supabase.realtime.connect()
    }
    window.addEventListener('online', onOnline)

    return () => {
      window.removeEventListener('online', onOnline)
      // Leaves the topic and forgets the channel: nothing is left open when
      // the user walks out of the board.
      void supabase.removeChannel(channel)
    }
  }, [boardId, qc])
}
