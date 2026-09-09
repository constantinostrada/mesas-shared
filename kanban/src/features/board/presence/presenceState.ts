import type { PresenceColor } from './colors'
import { colorForUser, displayName } from './colors'

/**
 * Everyone else's presence, as the board renders it.
 *
 * Pure on purpose, like the phase 2 change reducer: what the acceptance
 * criteria talk about — an avatar that appears and disappears, a cursor that
 * glides instead of jumping, a card outlined while someone has it open, a
 * cursor that fades instead of freezing — is decided here, with no React, no
 * socket and no clock of its own.
 */

/** A point in BOARD coordinates: pixels from the board's content origin,
 *  scroll included. Not viewport coordinates — two people on differently
 *  sized screens must be pointing at the same card, not the same pixel. */
export type Point = { x: number; y: number }

/**
 * What a client publishes about itself when it joins. IDENTITY ONLY, and
 * tracked exactly once: everything that changes while the tab is open travels
 * as a broadcast instead. Re-tracking a presence key leaves a stale duplicate
 * behind in the other clients' presence state and, worse, their leave events
 * then stop matching — the avatar of someone who closed the tab never goes.
 */
export type PresenceMeta = {
  /** One per TAB, not per user: two tabs are two cursors. */
  key: string
  userId: string
  email: string
}

export type Peer = PresenceMeta & {
  color: PresenceColor
  name: string
  /** The card this peer has open, from their `editing` broadcast. */
  editingCardId: string | null
  /** Last position received. */
  target: Point | null
  /** Where the cursor is drawn right now, easing toward `target`. */
  at: Point | null
  /** When they went away, so the cursor can fade out. null while connected. */
  leftAt: number | null
}

export type Peers = Readonly<Record<string, Peer>>

export const NO_PEERS: Peers = {}

/** How long a cursor lingers, fading, after its owner disappears. */
export const FADE_MS = 600

/** Time constant of the cursor easing. Smaller = snappier, jerkier. */
const EASE_TAU_MS = 70

/** Below this, the cursor is close enough to just land on the target. */
const SNAP_PX = 0.25

const samePeer = (peer: Peer, meta: PresenceMeta): boolean =>
  peer.userId === meta.userId && peer.email === meta.email && peer.leftAt === null

function peerFrom(meta: PresenceMeta, previous?: Peer): Peer {
  return {
    ...meta,
    color: colorForUser(meta.userId),
    name: displayName(meta.email),
    editingCardId: previous?.editingCardId ?? null,
    target: previous?.target ?? null,
    at: previous?.at ?? null,
    leftAt: null,
  }
}

/**
 * The peers after a full presence snapshot.
 *
 * Whoever is missing from the snapshot is not deleted: they are stamped with
 * `leftAt` so their cursor can fade. `pruneFaded` removes them once it has.
 * Returns the same object when the snapshot says nothing new, so a re-render
 * only happens when something actually changed.
 */
export function syncPeers(peers: Peers, metas: readonly PresenceMeta[], now: number): Peers {
  const next: Record<string, Peer> = {}
  let changed = false

  for (const meta of metas) {
    const previous = peers[meta.key]
    if (previous && samePeer(previous, meta)) {
      next[meta.key] = previous
    } else {
      // Also the path back for someone who was fading and came back.
      next[meta.key] = peerFrom(meta, previous)
      changed = true
    }
  }

  for (const [key, peer] of Object.entries(peers)) {
    if (next[key]) continue
    if (peer.leftAt === null) {
      next[key] = { ...peer, leftAt: now, editingCardId: null }
      changed = true
    } else {
      // Still fading: pruneFaded owns its removal, not the snapshot.
      next[key] = peer
    }
  }

  // Every existing key is carried over above, so "nothing changed" is enough.
  return changed ? next : peers
}

/** The peers after one "I have this card open" message (null when they closed
 *  it). Like every broadcast, it only counts for someone presence already
 *  says is here. */
export function setEditing(peers: Peers, key: string, cardId: string | null): Peers {
  const peer = peers[key]
  if (!peer || peer.leftAt !== null) return peers
  if (peer.editingCardId === cardId) return peers
  return { ...peers, [key]: { ...peer, editingCardId: cardId } }
}

/** The peers after one cursor message. Unknown senders are ignored: presence
 *  is the roster, a broadcast alone does not put anyone on the board. */
export function moveCursor(peers: Peers, key: string, point: Point): Peers {
  const peer = peers[key]
  if (!peer || peer.leftAt !== null) return peers
  if (peer.target && peer.target.x === point.x && peer.target.y === point.y) return peers
  // The first point appears where it is; there is nowhere to glide from.
  return { ...peers, [key]: { ...peer, target: point, at: peer.at ?? point } }
}

/**
 * One frame of easing: every cursor moves a fraction of the way to its
 * target, the fraction depending on how long the frame took, so the motion
 * looks the same at 60 and at 120 Hz. Returns the same object when nothing
 * moved, which is what lets the animation loop stop re-rendering.
 */
export function stepCursors(peers: Peers, dtMs: number): Peers {
  const alpha = 1 - Math.exp(-Math.max(dtMs, 0) / EASE_TAU_MS)
  let next: Record<string, Peer> | null = null

  for (const [key, peer] of Object.entries(peers)) {
    const { at, target } = peer
    if (!target || !at) continue
    const dx = target.x - at.x
    const dy = target.y - at.y
    if (Math.abs(dx) < SNAP_PX && Math.abs(dy) < SNAP_PX) {
      if (at.x === target.x && at.y === target.y) continue
      next ??= { ...peers }
      next[key] = { ...peer, at: target }
      continue
    }
    next ??= { ...peers }
    next[key] = { ...peer, at: { x: at.x + dx * alpha, y: at.y + dy * alpha } }
  }

  return next ?? peers
}

/** Drops the peers whose fade has finished. */
export function pruneFaded(peers: Peers, now: number, fadeMs: number = FADE_MS): Peers {
  let next: Record<string, Peer> | null = null
  for (const [key, peer] of Object.entries(peers)) {
    if (peer.leftAt !== null && now - peer.leftAt >= fadeMs) {
      next ??= { ...peers }
      delete next[key]
    }
  }
  return next ?? peers
}

/**
 * Who has each card open — the "está editando" indicator. Someone who has
 * left stops holding a card the moment they go, so no border is left behind.
 */
export function editorsByCard(
  peers: readonly Peer[],
  excludeKey?: string,
): ReadonlyMap<string, Peer> {
  const map = new Map<string, Peer>()
  for (const peer of peers) {
    if (peer.key === excludeKey) continue
    if (peer.leftAt === null && peer.editingCardId) map.set(peer.editingCardId, peer)
  }
  return map
}

// --- parsing ---------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/**
 * The metas out of `channel.presenceState()`: `{ [key]: [meta, ...] }`, one
 * entry per tracked client. Anything unreadable is skipped rather than
 * rendered as a ghost.
 */
export function parsePresenceState(raw: unknown): PresenceMeta[] {
  if (!isObject(raw)) return []
  const metas: PresenceMeta[] = []
  for (const [key, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!isObject(entry)) continue
      const userId = str(entry.userId)
      const email = str(entry.email)
      if (!userId || !email) continue
      metas.push({ key, userId, email })
      // One meta per key: a tab that somehow tracked twice is still one cursor.
      break
    }
  }
  return metas
}

/** The `{ key, cardId }` of an editing broadcast, or null if it is not one. */
export function parseEditingMessage(
  payload: unknown,
): { key: string; cardId: string | null } | null {
  if (!isObject(payload)) return null
  const key = str(payload.key)
  if (!key) return null
  const cardId = payload.cardId
  if (cardId !== null && typeof cardId !== 'string') return null
  return { key, cardId }
}

/** The `{ key, x, y }` of a cursor broadcast, or null if it is not one. */
export function parseCursorMessage(payload: unknown): { key: string; point: Point } | null {
  if (!isObject(payload)) return null
  const key = str(payload.key)
  const { x, y } = payload
  if (!key || typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { key, point: { x, y } }
}
