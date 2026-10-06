import { LOGIN_SURROGATE_MARKER, LOGIN_SURROGATE_NAME } from './consts.js'
import type { LoginEnv } from './types.js'
import type { LoginEnvHelper } from './env/types.js'

export const createLoginEnvHelper = (): LoginEnvHelper => {
  const isEmbedded = (): boolean => {
    try {
      return window.self !== window.top
    } catch {
      return true
    }
  }

  const markSurrogate = (): void => {
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

  const isSurrogate = (): boolean => {
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

  const clearSurrogate = (): void => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.sessionStorage.removeItem(LOGIN_SURROGATE_MARKER)
    } catch { /* nothing to clean up if storage was never available */ }
  }

  const defaultLoginEnv = (): LoginEnv => {
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

  return { isEmbedded, markSurrogate, isSurrogate, clearSurrogate, defaultLoginEnv }
}

export const loginEnvHelper = createLoginEnvHelper()

/** @deprecated compat:factory-refactor — use `loginEnvHelper.markSurrogate()` */
export const markSurrogate = (): void => loginEnvHelper.markSurrogate()

/** @deprecated compat:factory-refactor — use `loginEnvHelper.clearSurrogate()` */
export const clearSurrogate = (): void => loginEnvHelper.clearSurrogate()
