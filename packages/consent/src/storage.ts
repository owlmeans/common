import {
  CONSENT_COOKIE_DAYS, CONSENT_ESSENTIAL, CONSENT_KEY, CONSENT_SCHEMA_VERSION,
} from './consts.js'
import type { ConsentOptions, ConsentRecord } from './types.js'
import type { ConsentStorageHelper } from './storage/types.js'

export const createConsentStorageHelper = (): ConsentStorageHelper => {
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

  const migrateConsent = (raw: ConsentRecord | null): ConsentRecord | null =>
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

  const readConsent = (opts?: ConsentOptions): ConsentRecord | null => {
    const name = key(opts)
    let raw: string | null = null
    try {
      raw = typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null
    } catch { /* private modes and blocked storage both throw; the cookie may still answer */ }

    return migrateConsent(parse(raw) ?? parse(fromCookie(name)))
  }

  const writeConsent = (record: ConsentRecord, opts?: ConsentOptions): void => {
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

  const clearConsent = (opts?: ConsentOptions): void => {
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

  return { migrateConsent, readConsent, writeConsent, clearConsent }
}

export const consentStorageHelper = createConsentStorageHelper()

/** @deprecated compat:factory-refactor — use `consentStorageHelper.readConsent(…)` */
export const readConsent = (opts?: ConsentOptions): ConsentRecord | null => consentStorageHelper.readConsent(opts)

/** @deprecated compat:factory-refactor — use `consentStorageHelper.writeConsent(…)` */
export const writeConsent = (record: ConsentRecord, opts?: ConsentOptions): void =>
  consentStorageHelper.writeConsent(record, opts)

/** @deprecated compat:factory-refactor — use `consentStorageHelper.clearConsent(…)` */
export const clearConsent = (opts?: ConsentOptions): void => consentStorageHelper.clearConsent(opts)
