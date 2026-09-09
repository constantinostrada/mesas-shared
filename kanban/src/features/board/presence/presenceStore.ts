import type { Peer, Peers } from './presenceState'
import { NO_PEERS } from './presenceState'

/**
 * Where presence lives between the socket and the screen.
 *
 * Two subscriptions on purpose, because the two halves change at wildly
 * different rates: the ROSTER (who is here, who is editing what) changes when
 * somebody comes or goes, while POSITIONS change ~33 times a second per peer
 * and again on every animation frame. Pushing all of that through the board's
 * React state would re-render every column and card at 60 Hz for the sake of
 * a few moving arrows; here only the cursor layer listens to the fast half.
 */

/** Only what the board itself has to re-render for. Sorted, so it is stable. */
export type Roster = readonly Peer[]

export type PresenceStore = {
  getPeers: () => Peers
  getRoster: () => Roster
  subscribeRoster: (listener: () => void) => () => void
  update: (fn: (peers: Peers) => Peers) => void
}

const rosterOf = (peers: Peers): Peer[] =>
  Object.values(peers).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

/** Cursor coordinates deliberately left out: they must not wake the board. */
const sameRoster = (a: Roster, b: Roster): boolean =>
  a.length === b.length &&
  a.every((peer, i) => {
    const other = b[i]
    return (
      peer.key === other.key &&
      peer.userId === other.userId &&
      peer.email === other.email &&
      peer.editingCardId === other.editingCardId &&
      peer.leftAt === other.leftAt
    )
  })

export function createPresenceStore(): PresenceStore {
  let peers: Peers = NO_PEERS
  let roster: Roster = []
  const listeners = new Set<() => void>()

  return {
    getPeers: () => peers,
    getRoster: () => roster,
    subscribeRoster(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update(fn) {
      const next = fn(peers)
      if (next === peers) return
      peers = next
      const nextRoster = rosterOf(next)
      if (sameRoster(nextRoster, roster)) return
      roster = nextRoster
      for (const listener of listeners) listener()
    },
  }
}
