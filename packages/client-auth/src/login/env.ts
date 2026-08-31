import { LOGIN_SURROGATE_MARKER, LOGIN_SURROGATE_NAME } from './consts.js'
import type { LoginEnv } from './types.js'

/**
 * Whether this document is embedded in a frame.
 *
 * Reading `window.top` across origins throws, and that throw is itself the answer: a `top` that
 * differs and a `top` that cannot be reached both mean "framed".
 */
export const isEmbedded = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * Record that this window is the surrogate login window, while that is still knowable.
 *
 * Must run on the surrogate's **first** load, before the flow navigates to the provider:
 * `window.name` is the only evidence at that point, and browsers clear it as soon as a top-level
 * context goes cross-origin — so by the time the provider redirects back, the name is gone and
 * this window would look like an ordinary tab.
 *
 * Idempotent, and a no-op in every window that is not the surrogate.
 */
export const markSurrogate = (): void => {
  if (typeof window === 'undefined' || window.name !== LOGIN_SURROGATE_NAME) {
    return
  }
  try {
    window.sessionStorage.setItem(LOGIN_SURROGATE_MARKER, '1')
  } catch {
    // Storage can be unavailable (private modes, blocked cookies). The `window.name` check still
    // covers the case where nothing cross-origin happened in between.
  }
}

/** Whether this document is the surrogate login window. */
export const isSurrogate = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.name === LOGIN_SURROGATE_NAME) {
    return true
  }
  try {
    return window.sessionStorage.getItem(LOGIN_SURROGATE_MARKER) === '1'
  } catch {
    return false
  }
}

/** Forget the surrogate marker — called once its token has been handed back. */
export const clearSurrogate = (): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.removeItem(LOGIN_SURROGATE_MARKER)
  } catch { /* nothing to clean up if storage was never available */ }
}

/**
 * Default login environment.
 *
 * The single source of environment truth for cascade selection — a plugin's `match` reads this
 * and never probes `window` itself, so a non-DOM host can drive the same plugins by supplying its
 * own descriptor.
 */
export const defaultLoginEnv = (): LoginEnv => {
  const hasWindow = typeof window !== 'undefined'
  if (!hasWindow) {
    return { hasWindow, embedded: false, surrogate: false, hasOpener: false }
  }

  return {
    hasWindow,
    embedded: isEmbedded(),
    surrogate: isSurrogate(),
    // `Cross-Origin-Opener-Policy: same-origin` from the provider severs this permanently, which
    // is why it is observed rather than assumed from "we were opened by someone".
    hasOpener: window.opener != null,
  }
}
