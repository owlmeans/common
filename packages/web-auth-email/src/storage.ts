import { EMAIL_DEVICE_ID_PATTERN, EMAIL_OFFER_TTL_SECONDS } from '@owlmeans/auth-email'
import { EMAIL_DEVICE_ID_BYTES, EMAIL_DEVICE_STORAGE, EMAIL_OFFER_STORAGE } from './consts.js'
import type {
  EmailStorageArea, EmailStorageHelper, EmailStorageHelperOptions, StoredEmailOffer,
} from './storage/types.js'

/** A storage area of the page, or null where there is no page or the browser refuses it. */
const areaOf = (name: 'localStorage' | 'sessionStorage') => (): EmailStorageArea | null => {
  try {
    return typeof window !== 'undefined' ? window[name] ?? null : null
  } catch {
    return null
  }
}

export const createEmailStorageHelper = (opts: EmailStorageHelperOptions = {}): EmailStorageHelper => {
  const local = opts.local ?? areaOf('localStorage')
  const session = opts.session ?? areaOf('sessionStorage')
  const random = opts.random ?? ((count: number) => crypto.getRandomValues(new Uint8Array(count)))
  const now = opts.now ?? (() => Date.now())
  const valid = new RegExp(EMAIL_DEVICE_ID_PATTERN)

  /** The id of this page when the browser keeps nothing — still one id, not one per request. */
  let ephemeral: string | null = null

  const base64url = (bytes: Uint8Array): string => {
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const read = (area: EmailStorageArea | null, key: string): string | null => {
    try {
      return area?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  const write = (area: EmailStorageArea | null, key: string, value: string | null): boolean => {
    if (area == null) {
      return false
    }
    try {
      if (value == null) {
        area.removeItem(key)
      } else {
        area.setItem(key, value)
      }

      return true
    } catch {
      return false
    }
  }

  const deviceId = (): string => {
    const area = local()
    const stored = read(area, EMAIL_DEVICE_STORAGE)
    if (stored != null && valid.test(stored)) {
      return stored
    }
    if (ephemeral != null) {
      return ephemeral
    }
    const created = base64url(random(EMAIL_DEVICE_ID_BYTES))
    if (!write(area, EMAIL_DEVICE_STORAGE, created)) {
      ephemeral = created
    }

    return created
  }

  const offer = (owner?: string): string | null => {
    const raw = read(session(), EMAIL_OFFER_STORAGE)
    if (raw == null) {
      return null
    }
    let stored: Partial<StoredEmailOffer> | null = null
    try {
      stored = JSON.parse(raw) as Partial<StoredEmailOffer>
    } catch {
      return null
    }
    if (typeof stored?.ticket !== 'string' || stored.ticket === ''
      || typeof stored.expiresAt !== 'number' || stored.expiresAt <= now()) {
      return null
    }
    if (owner != null && stored.owner != null && stored.owner !== owner) {
      return null
    }

    return stored.ticket
  }

  const keepOffer = (ticket: string, owner?: string): void => {
    const stored: StoredEmailOffer = {
      ticket, ...(owner != null ? { owner } : {}), expiresAt: now() + EMAIL_OFFER_TTL_SECONDS * 1000,
    }
    write(session(), EMAIL_OFFER_STORAGE, JSON.stringify(stored))
  }

  const dropOffer = (): void => {
    write(session(), EMAIL_OFFER_STORAGE, null)
  }

  return { deviceId, offer, keepOffer, dropOffer }
}

export const emailStorageHelper = createEmailStorageHelper()
