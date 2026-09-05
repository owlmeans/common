import { useEffect, useState } from 'react'

/** Tailwind's `md` — the width at which the navigation shell swaps its side menu for the bar. */
export const MOBILE_BREAKPOINT = 768

/**
 * Whether the viewport is narrower than Tailwind's `md`, for a component that has to pick a tree
 * rather than render both and hide one with `md:hidden`.
 *
 * It matches a media query instead of listening for `resize` the way `useBreakPoint` does: the
 * browser evaluates the query itself and notifies only when the answer flips, so dragging a window
 * across the whole width costs one render rather than one per frame.
 *
 * The answer is `false` before the first effect and on a server render, because `window` is the
 * only thing that knows the width. That makes the desktop tree the one server-rendered HTML and
 * the first client paint agree on, so hydration never mismatches.
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia == null) {
      return
    }

    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const read = () => setIsMobile(query.matches)
    read()
    query.addEventListener('change', read)

    return () => query.removeEventListener('change', read)
  }, [])

  return isMobile
}
