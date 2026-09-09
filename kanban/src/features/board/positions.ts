import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

type Positioned = { position: string }

/** Position for appending after the last item (or the first key if empty). */
export function positionAfterLast(items: Positioned[]): string {
  const last = items.length ? items[items.length - 1].position : null
  return generateKeyBetween(last, null)
}

/**
 * Position for inserting so the item lands at `index` inside `items`
 * (which must be sorted and must NOT contain the item being moved).
 */
export function positionAtIndex(items: Positioned[], index: number): string {
  const prev = index > 0 ? items[index - 1].position : null
  const next = index < items.length ? items[index].position : null
  return generateKeyBetween(prev, next)
}

export function initialPositions(n: number): string[] {
  return generateNKeysBetween(null, null, n)
}

export function byPosition<T extends Positioned>(a: T, b: T): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
}
