/**
 * Calls `fn` at most once every `ms`, leading and trailing.
 *
 * A mousemove fires as fast as the pointer reports — 120+ times a second on a
 * good mouse — and every one of those would be a websocket frame. This caps
 * the rate; the trailing call is what makes the cursor land where the pointer
 * actually stopped instead of wherever it happened to be at the last tick.
 */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const fire = (args: A) => {
    last = Date.now()
    fn(...args)
  }

  const throttled = (...args: A) => {
    const wait = ms - (Date.now() - last)
    if (wait <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      fire(args)
      return
    }
    // Inside the window: remember the newest arguments and let the timer run.
    pending = args
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      if (pending) {
        const next = pending
        pending = null
        fire(next)
      }
    }, wait)
  }

  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }

  return throttled
}
