import { useEffect, type RefObject } from 'react'
import { FOCUSABLE } from './consts.local.js'

/**
 * Keep keyboard focus inside an open consent surface, the way its overlay keeps the pointer out of
 * the page behind it.
 *
 * On open, focus goes to the surface ITSELF (`tabIndex={-1}`), never to a button: landing on
 * "Accept all" would be a nudge. Tab and Shift+Tab cycle through the surface's own controls; on
 * close, focus returns to wherever it was. Nothing pulls focus back on `focusin` — a script (or a
 * test) focusing a field programmatically is not a keyboard user escaping, and fighting it only
 * makes both sides flaky.
 */
export const useConsentFocus = (ref: RefObject<HTMLElement | null>, active: boolean): void => {
  useEffect(() => {
    const node = ref.current
    if (!active || node == null || typeof document === 'undefined') {
      return
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node.focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        return
      }
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) {
        event.preventDefault()

        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (!node.contains(current)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)

    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous != null && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [active])
}
