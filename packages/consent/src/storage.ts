import {
  CONSENT_COOKIE_DAYS, CONSENT_ESSENTIAL, CONSENT_KEY, CONSENT_SCHEMA_VERSION,
} from './consts.js'
import type { ConsentOptions, ConsentRecord } from './types.js'

const key = (opts?: ConsentOptions): string => opts?.storageKey ?? CONSENT_KEY

const parse = (raw: string | null | undefined): ConsentRecord | null => {
  if (raw == null || raw === '') {
    return null
  }
  try {
    const value = JSON.parse(raw) as unknown

    return value != null && typeof value === 'object' ? value as ConsentRecord : null
  } catch {
    return null
  }
}

/**
 * Bring a stored record up to the current shape.
 *
 * A record with no `v` was written before the essential category existed, when it was implicitly
 * always granted. The visitor DID choose; upgrading in place honours that choice, where treating
 * the record as unusable would re-prompt everyone who has ever visited.
 */
export const migrateConsent = (raw: ConsentRecord | null): ConsentRecord | null =>
  raw == null ? null
    : raw.v === CONSENT_SCHEMA_VERSION ? raw
      : { ...raw, [CONSENT_ESSENTIAL]: true, v: CONSENT_SCHEMA_VERSION }

const fromCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null
  }
  const parts = `; ${document.cookie}`.split(`; ${name}=`)

  return parts.length === 2 ? parts.pop()?.split(';').shift() ?? null : null
}

/**
 * What this browser has already chosen, or null.
 *
 * localStorage first and the cookie second, because that is the order the widget this generalises
 * used and the two can disagree: a visitor who cleared site data but kept cookies still has an
 * answer, and asking them again would be wrong.
 */
export const readConsent = (opts?: ConsentOptions): ConsentRecord | null => {
  const name = key(opts)
  let raw: string | null = null
  try {
    raw = typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null
  } catch { /* private modes and blocked storage both throw; the cookie may still answer */ }

  return migrateConsent(parse(raw) ?? parse(fromCookie(name)))
}

/**
 * Record the choice in both places.
 *
 * Two stores rather than one because neither is reliable alone: localStorage is cleared by "clear
 * site data" while the cookie survives it, and the cookie is refused where third-party storage is
 * blocked while localStorage may not be.
 */
export const writeConsent = (record: ConsentRecord, opts?: ConsentOptions): void => {
  const name = key(opts)
  const value = JSON.stringify({ ...record, v: CONSENT_SCHEMA_VERSION })
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value)
    }
  } catch { /* the cookie below is the fallback */ }

  if (typeof document === 'undefined') {
    return
  }
  const days = opts?.cookieDays ?? CONSENT_COOKIE_DAYS
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  const domain = opts?.cookieDomain != null ? `;domain=${opts.cookieDomain}` : ''
  // `SameSite=Lax` is stated rather than left to the browser default, which differs between them.
  // This cookie is never sent cross-site on purpose — it records a preference, not a session.
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax${domain}`
}

export const clearConsent = (opts?: ConsentOptions): void => {
  const name = key(opts)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(name)
    }
  } catch { /* nothing to remove if storage was never available */ }
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  }
}
