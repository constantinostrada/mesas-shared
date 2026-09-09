import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PRESENCE_PALETTE,
  colorForUser,
  displayName,
  initialsFor,
} from '../presence/colors'
import { throttle } from '../presence/throttle'
import {
  FADE_MS,
  NO_PEERS,
  editorsByCard,
  moveCursor,
  parseCursorMessage,
  parseEditingMessage,
  parsePresenceState,
  pruneFaded,
  setEditing,
  stepCursors,
  syncPeers,
} from '../presence/presenceState'
import type { PresenceMeta, Peers } from '../presence/presenceState'

const meta = (key: string, userId: string): PresenceMeta => ({
  key,
  userId,
  email: `${userId}@example.dev`,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('colorForUser', () => {
  it('gives the same user the same colour every time, on any screen', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    expect(colorForUser(id)).toBe(colorForUser(id))
    expect(PRESENCE_PALETTE).toContain(colorForUser(id))
  })

  it('spreads a handful of users across the palette', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `user-${i}`)
    const used = new Set(ids.map(colorForUser))
    expect(used.size).toBe(PRESENCE_PALETTE.length)
  })

  it('labels people by the local part of their email', () => {
    expect(displayName('ana.perez@example.dev')).toBe('ana.perez')
    expect(initialsFor('ana.perez@example.dev')).toBe('AP')
    expect(initialsFor('bob@example.dev')).toBe('BO')
  })
})

describe('throttle', () => {
  it('emits at most ~33 calls per second however fast the pointer moves', () => {
    vi.useFakeTimers()
    const at: number[] = []
    const send = throttle(() => at.push(Date.now()), 30)

    // Three seconds of mousemove at 240 Hz: far more than any real mouse.
    for (let i = 0; i < 720; i++) {
      send()
      vi.advanceTimersByTime(1000 / 240)
    }
    vi.advanceTimersByTime(50)

    // The rate the acceptance criterion talks about: the busiest second.
    const busiest = Math.max(...at.map((t0) => at.filter((t) => t >= t0 && t - t0 < 1000).length))
    expect(busiest).toBeLessThanOrEqual(34) // 1000ms / 30ms, plus the leading call
    expect(at.length).toBeGreaterThan(90) // and it really did keep sending
  })

  it('still delivers where the pointer stopped', () => {
    vi.useFakeTimers()
    const sent: number[] = []
    const send = throttle((n: number) => sent.push(n), 30)

    send(1)
    send(2)
    send(3) // inside the window: only the last one survives
    expect(sent).toEqual([1])
    vi.advanceTimersByTime(30)
    expect(sent).toEqual([1, 3])
  })

  it('drops the pending call when cancelled', () => {
    vi.useFakeTimers()
    const sent: number[] = []
    const send = throttle((n: number) => sent.push(n), 30)
    send(1)
    send(2)
    send.cancel()
    vi.advanceTimersByTime(100)
    expect(sent).toEqual([1])
  })
})

describe('syncPeers', () => {
  it('adds whoever is on the board and keeps their colour', () => {
    const peers = syncPeers(NO_PEERS, [meta('tab-1', 'ana'), meta('tab-2', 'beto')], 1000)
    expect(Object.keys(peers)).toEqual(['tab-1', 'tab-2'])
    expect(peers['tab-1'].color).toBe(colorForUser('ana'))
    expect(peers['tab-1'].name).toBe('ana')
  })

  it('treats two tabs of the same user as two peers', () => {
    const peers = syncPeers(NO_PEERS, [meta('tab-1', 'ana'), meta('tab-2', 'ana')], 1000)
    expect(Object.keys(peers)).toHaveLength(2)
    expect(peers['tab-1'].color).toBe(peers['tab-2'].color)
  })

  it('returns the very same object when the snapshot says nothing new', () => {
    const metas = [meta('tab-1', 'ana')]
    const first = syncPeers(NO_PEERS, metas, 1000)
    expect(syncPeers(first, [meta('tab-1', 'ana')], 1100)).toBe(first)
  })

  it('keeps the cursor and the open card across a snapshot', () => {
    let peers = syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 1000)
    peers = moveCursor(peers, 'tab-1', { x: 100, y: 50 })
    peers = setEditing(peers, 'tab-1', 'card-9')
    peers = syncPeers(peers, [meta('tab-1', 'ana'), meta('tab-2', 'beto')], 1100)
    expect(peers['tab-1'].at).toEqual({ x: 100, y: 50 })
    expect(peers['tab-1'].editingCardId).toBe('card-9')
  })

  it('marks whoever left as fading instead of dropping them on the spot', () => {
    const before = syncPeers(NO_PEERS, [meta('tab-1', 'ana'), meta('tab-2', 'beto')], 1000)
    const after = syncPeers(before, [meta('tab-1', 'ana')], 2000)
    expect(after['tab-2'].leftAt).toBe(2000)
    expect(pruneFaded(after, 2000 + FADE_MS - 1)['tab-2']).toBeDefined()
    expect(pruneFaded(after, 2000 + FADE_MS)['tab-2']).toBeUndefined()
  })

  it('brings back someone who left and reconnected', () => {
    const before = syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 1000)
    const gone = syncPeers(before, [], 2000)
    const back = syncPeers(gone, [meta('tab-1', 'ana')], 2100)
    expect(back['tab-1'].leftAt).toBeNull()
  })

  it('stops counting someone who left as editing a card', () => {
    const before = setEditing(syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 1000), 'tab-1', 'card-9')
    expect(editorsByCard(Object.values(before)).get('card-9')?.name).toBe('ana')
    const gone = syncPeers(before, [], 2000)
    expect(editorsByCard(Object.values(gone)).get('card-9')).toBeUndefined()
  })

  it('does not outline the card you have open yourself', () => {
    const peers = setEditing(syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 1000), 'tab-1', 'card-9')
    expect(editorsByCard(Object.values(peers), 'tab-1').size).toBe(0)
  })
})

describe('setEditing', () => {
  const base = syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 0)

  it('outlines the card and clears it again', () => {
    const open = setEditing(base, 'tab-1', 'card-9')
    expect(editorsByCard(Object.values(open)).get('card-9')?.name).toBe('ana')
    const closed = setEditing(open, 'tab-1', null)
    expect(editorsByCard(Object.values(closed)).size).toBe(0)
  })

  it('ignores someone presence does not know about', () => {
    expect(setEditing(base, 'nobody', 'card-9')).toBe(base)
  })

  it('returns the same object when nothing changed', () => {
    const open = setEditing(base, 'tab-1', 'card-9')
    expect(setEditing(open, 'tab-1', 'card-9')).toBe(open)
  })
})

describe('moveCursor', () => {
  const base = syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 0)

  it('places the first point without gliding from nowhere', () => {
    const peers = moveCursor(base, 'tab-1', { x: 10, y: 20 })
    expect(peers['tab-1'].at).toEqual({ x: 10, y: 20 })
    expect(peers['tab-1'].target).toEqual({ x: 10, y: 20 })
  })

  it('ignores a cursor from someone who is not present', () => {
    expect(moveCursor(base, 'nobody', { x: 1, y: 1 })).toBe(base)
  })

  it('ignores a repeated point', () => {
    const peers = moveCursor(base, 'tab-1', { x: 10, y: 20 })
    expect(moveCursor(peers, 'tab-1', { x: 10, y: 20 })).toBe(peers)
  })
})

describe('stepCursors', () => {
  const withCursor = (from: { x: number; y: number }, to: { x: number; y: number }): Peers => {
    let peers = syncPeers(NO_PEERS, [meta('tab-1', 'ana')], 0)
    peers = moveCursor(peers, 'tab-1', from)
    return moveCursor(peers, 'tab-1', to)
  }

  it('moves toward the target without overshooting it', () => {
    let peers = withCursor({ x: 0, y: 0 }, { x: 100, y: 0 })
    const seen: number[] = []
    for (let frame = 0; frame < 40; frame++) {
      peers = stepCursors(peers, 16)
      seen.push(peers['tab-1'].at!.x)
    }
    // Strictly increasing, never past the target, and it gets there.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(Math.max(...seen)).toBeLessThanOrEqual(100)
    expect(seen.at(-1)).toBe(100)
  })

  it('takes no single big jump: one frame covers only part of the way', () => {
    const peers = stepCursors(withCursor({ x: 0, y: 0 }, { x: 100, y: 0 }), 16)
    expect(peers['tab-1'].at!.x).toBeGreaterThan(0)
    expect(peers['tab-1'].at!.x).toBeLessThan(60)
  })

  it('advances the same distance in the same time at any frame rate', () => {
    let slow = withCursor({ x: 0, y: 0 }, { x: 100, y: 0 })
    let fast = withCursor({ x: 0, y: 0 }, { x: 100, y: 0 })
    slow = stepCursors(slow, 32)
    fast = stepCursors(stepCursors(fast, 16), 16)
    expect(slow['tab-1'].at!.x).toBeCloseTo(fast['tab-1'].at!.x, 6)
  })

  it('returns the same object once every cursor has arrived', () => {
    let peers = withCursor({ x: 0, y: 0 }, { x: 10, y: 10 })
    for (let frame = 0; frame < 60; frame++) peers = stepCursors(peers, 16)
    expect(stepCursors(peers, 16)).toBe(peers)
  })
})

describe('parsing', () => {
  it('reads the presence state Supabase hands back', () => {
    const metas = parsePresenceState({
      'tab-1': [{ userId: 'ana', email: 'ana@example.dev', presence_ref: 'r1' }],
      'tab-2': [{ userId: 'beto', email: 'beto@example.dev', presence_ref: 'r2' }],
    })
    expect(metas).toEqual([
      { key: 'tab-1', userId: 'ana', email: 'ana@example.dev' },
      { key: 'tab-2', userId: 'beto', email: 'beto@example.dev' },
    ])
  })

  it('skips entries it cannot read instead of rendering a ghost', () => {
    expect(parsePresenceState({ 'tab-1': [{ email: 'no-id@example.dev' }] })).toEqual([])
    expect(parsePresenceState({ 'tab-1': 'nope' })).toEqual([])
    expect(parsePresenceState(null)).toEqual([])
  })

  it('reads a cursor message and refuses a malformed one', () => {
    expect(parseCursorMessage({ key: 'tab-1', x: 3, y: 4 })).toEqual({
      key: 'tab-1',
      point: { x: 3, y: 4 },
    })
    expect(parseCursorMessage({ key: 'tab-1', x: '3', y: 4 })).toBeNull()
    expect(parseCursorMessage({ key: 'tab-1', x: NaN, y: 0 })).toBeNull()
    expect(parseCursorMessage(undefined)).toBeNull()
  })

  it('reads an editing message, opening and closing alike', () => {
    expect(parseEditingMessage({ key: 'tab-1', cardId: 'card-9' })).toEqual({
      key: 'tab-1',
      cardId: 'card-9',
    })
    expect(parseEditingMessage({ key: 'tab-1', cardId: null })).toEqual({
      key: 'tab-1',
      cardId: null,
    })
    expect(parseEditingMessage({ key: 'tab-1', cardId: 7 })).toBeNull()
    expect(parseEditingMessage({ cardId: 'card-9' })).toBeNull()
  })
})
