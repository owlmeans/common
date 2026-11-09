import { useEffect, type RefObject } from 'react'

/**
 * Keep the page reachable behind a bar that blocks nothing.
 *
 * The bar floats over the page, so on a short page — a sign-in screen on a phone — it would sit on
 * the very controls a visitor may use without answering it, with nothing to scroll them out from
 * under it. While the bar is up the body therefore gets as much bottom padding as the bar is tall
 * (followed through a `ResizeObserver`, so a language switch or a rotated phone keeps it exact): the
 * end of the page can always be scrolled above the bar. Whatever padding the page already had stays
 * under it, and every trace is removed when the bar goes — answered, replaced by the window, or
 * unmounted.
 */
export const useBarClearance = (ref: RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    const bar = ref.current
    if (bar == null || typeof document === 'undefined') {
      return
    }
    const body = document.body
    const written = body.style.paddingBottom
    const base = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0

    const apply = (): void => {
      body.style.paddingBottom = `${base + Math.ceil(bar.getBoundingClientRect().height)}px`
    }
    apply()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null
    observer?.observe(bar)

    return () => {
      observer?.disconnect()
      body.style.paddingBottom = written
    }
  }, [])
}
