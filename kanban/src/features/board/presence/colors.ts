/**
 * Every user gets one colour, and it is the same colour on every screen:
 * their avatar, their cursor and the border of the card they are editing all
 * pick it from here. Derived from the user id, never assigned, so two
 * browsers agree without exchanging anything.
 */

/** Chosen to stay legible on the board's white cards and slate columns. */
export const PRESENCE_PALETTE = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0d9488', // teal
  '#0284c7', // sky
  '#4f46e5', // indigo
  '#9333ea', // purple
  '#db2777', // pink
  '#475569', // slate
] as const

export type PresenceColor = (typeof PRESENCE_PALETTE)[number]

/** FNV-1a, 32 bits: short, stable across engines, and good enough to spread. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function colorForUser(userId: string): PresenceColor {
  return PRESENCE_PALETTE[hash(userId) % PRESENCE_PALETTE.length]
}

/** What to call someone on a cursor label: the local part of their email. */
export function displayName(email: string): string {
  const local = email.split('@')[0]
  return local || email
}

/** One or two letters for the avatar circle. */
export function initialsFor(email: string): string {
  const parts = displayName(email)
    .split(/[.\-_+]/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)
  return letters.toUpperCase()
}
