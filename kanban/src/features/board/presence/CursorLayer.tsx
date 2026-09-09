import { useEffect, useRef } from 'react'
import { FADE_MS, pruneFaded, stepCursors } from './presenceState'
import type { PresenceStore, Roster } from './presenceStore'

type Props = {
  store: PresenceStore
  roster: Roster
  /** This tab's own key: you do not need to be shown your own pointer. */
  selfKey: string
}

/**
 * Everyone else's pointer, drawn over the board.
 *
 * The animation never goes through React state: one element per peer is
 * rendered when the roster changes, and the frame loop then writes transform
 * and opacity straight onto those elements. A cursor moving at 60 Hz must not
 * cost a re-render of every column and card on the board.
 *
 * Positions are in board coordinates, so the parent must be the positioned
 * element the coordinates were measured against.
 */
export function CursorLayer({ store, roster, selfKey }: Props) {
  const nodes = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    let frame = 0
    let previous = performance.now()

    const tick = (now: number) => {
      const dt = now - previous
      previous = now
      const wall = Date.now()
      // Ease every cursor one frame closer, then forget whoever has finished
      // fading. Both return the same object when there is nothing to do, so an
      // idle board notifies nobody.
      store.update((peers) => pruneFaded(stepCursors(peers, dt), wall))

      const peers = store.getPeers()
      for (const [key, element] of nodes.current) {
        const peer = peers[key]
        if (!peer?.at) {
          // Present but has not moved yet: nothing to point at.
          element.style.opacity = '0'
          continue
        }
        element.style.transform = `translate3d(${peer.at.x}px, ${peer.at.y}px, 0)`
        element.style.opacity =
          peer.leftAt === null
            ? '1'
            : String(Math.max(0, 1 - (wall - peer.leftAt) / FADE_MS))
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [store])

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {roster
        .filter((peer) => peer.key !== selfKey)
        .map((peer) => (
          <div
            key={peer.key}
            ref={(element) => {
              if (element) nodes.current.set(peer.key, element)
              else nodes.current.delete(peer.key)
            }}
            className="absolute top-0 left-0 will-change-transform"
            style={{ opacity: 0 }}
          >
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden>
              <path
                d="M2 1.5 L15.5 12 L9.5 12.6 L12.6 19.2 L9.6 20.5 L6.6 13.8 L2 18 Z"
                fill={peer.color}
                stroke="white"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute top-4 left-4 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-white shadow-sm"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name}
            </span>
          </div>
        ))}
    </div>
  )
}
