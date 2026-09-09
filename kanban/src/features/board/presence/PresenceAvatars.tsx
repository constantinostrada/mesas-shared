import { initialsFor } from './colors'
import type { Roster } from './presenceStore'

const MAX_SHOWN = 5

/**
 * Who is on the board, in the top right corner.
 *
 * One avatar per USER, not per tab: someone with the board open twice is one
 * person. Whoever is fading out of the cursor layer is already gone from
 * here — the avatar is the roster, and it must be honest immediately.
 */
export function PresenceAvatars({ roster, selfKey }: { roster: Roster; selfKey: string }) {
  const byUser = new Map<string, { color: string; email: string; isSelf: boolean }>()
  for (const peer of roster) {
    if (peer.leftAt !== null) continue
    const existing = byUser.get(peer.userId)
    byUser.set(peer.userId, {
      color: peer.color,
      email: peer.email,
      isSelf: (existing?.isSelf ?? false) || peer.key === selfKey,
    })
  }

  const people = [...byUser.values()].sort((a, b) =>
    a.isSelf === b.isSelf ? a.email.localeCompare(b.email) : a.isSelf ? -1 : 1,
  )
  if (people.length === 0) return null

  const shown = people.slice(0, MAX_SHOWN)
  const hidden = people.length - shown.length

  return (
    <div className="ml-auto flex shrink-0 items-center" aria-label="Personas en este board">
      {shown.map((person) => (
        <span
          key={person.email}
          title={person.isSelf ? `${person.email} (vos)` : person.email}
          className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white first:ml-0"
          style={{ backgroundColor: person.color }}
        >
          {initialsFor(person.email)}
        </span>
      ))}
      {hidden > 0 && (
        <span
          title={people
            .slice(MAX_SHOWN)
            .map((p) => p.email)
            .join(', ')}
          className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-500 text-[11px] font-semibold text-white ring-2 ring-white"
        >
          +{hidden}
        </span>
      )}
    </div>
  )
}
