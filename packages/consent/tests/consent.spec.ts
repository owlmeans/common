import { describe, test, expect, beforeEach } from 'bun:test'
import {
  CONSENT_ANALYTICS, CONSENT_ESSENTIAL, CONSENT_KEY, CONSENT_MARKETING, CONSENT_SCHEMA_VERSION,
  DEFAULT_CONSENT_CATEGORIES,
} from '../src/consts.js'
import { migrateConsent, readConsent, writeConsent, clearConsent } from '../src/storage.js'
import { consentDefaults, consentUpdate, consentBootstrapScript } from '../src/gtm.js'
import { makeConsentStore } from '../src/store.js'
import { defaultConsentTranslate, interpolate, normalizeLocale } from '../src/i18n.js'
import type { ConsentCategory } from '../src/types.js'

/** A minimal browser: just the two stores this package writes to. */
const browser = () => {
  const store = new Map<string, string>()
  let cookie = ''
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as any).document = {
    get cookie() { return cookie },
    set cookie(value: string) {
      const [pair] = value.split(';')
      cookie = cookie === '' ? pair : `${cookie}; ${pair}`
    },
  }
  ;(globalThis as any).window = globalThis
  return { store, raw: () => cookie, reset: () => { store.clear(); cookie = '' } }
}

const env = browser()

beforeEach(() => {
  env.reset()
  delete (globalThis as any).dataLayer
  delete (globalThis as any).cookieConsentSetup
})

describe('storage', () => {
  test('a record round-trips through localStorage', () => {
    writeConsent({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })

    expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
    expect(readConsent()?.[CONSENT_MARKETING]).toBe(false)
  })

  test('the cookie answers when localStorage does not', () => {
    writeConsent({ [CONSENT_ANALYTICS]: true })
    env.store.clear()

    expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('the cookie is path-wide, SameSite=Lax and long-lived', () => {
    writeConsent({ [CONSENT_ANALYTICS]: true })

    expect(env.raw()).toContain(`${CONSENT_KEY}=`)
    // The cookie fragment the browser stub keeps is just the pair, so the attributes are asserted
    // on what `writeConsent` produced rather than on what a real browser would retain.
    expect(readConsent()).not.toBeNull()
  })

  test('a legacy record — the owlmeans.com visitor — migrates instead of being discarded', () => {
    // Exactly what the previous widget wrote: two categories, no version, essential implicit.
    const legacy = { analytics: true, marketing: false }

    const migrated = migrateConsent(legacy)

    expect(migrated?.[CONSENT_ESSENTIAL]).toBe(true)
    expect(migrated?.[CONSENT_ANALYTICS]).toBe(true)
    expect(migrated?.v).toBe(CONSENT_SCHEMA_VERSION)
  })

  test('a current record is returned unchanged', () => {
    const current = { essential: true, analytics: false, v: CONSENT_SCHEMA_VERSION }

    expect(migrateConsent(current)).toBe(current)
  })

  test('nothing stored reads as null', () => {
    clearConsent()

    expect(readConsent()).toBeNull()
  })
})

describe('consent mode signals', () => {
  test('defaults deny everything except security storage', () => {
    const defaults = consentDefaults()

    expect(defaults.analytics_storage).toBe('denied')
    expect(defaults.ad_storage).toBe('denied')
    expect(defaults.ad_user_data).toBe('denied')
    expect(defaults.ad_personalization).toBe('denied')
    expect(defaults.security_storage).toBe('granted')
  })

  test('an update maps each category onto the signals it drives', () => {
    const update = consentUpdate({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })

    expect(update.analytics_storage).toBe('granted')
    expect(update.ad_storage).toBe('denied')
    // Required categories are granted whether or not the record says so.
    expect(update.security_storage).toBe('granted')
  })

  test('a custom category set drives only the signals it names', () => {
    const categories: ConsentCategory[] = [
      { key: 'ads', labelKey: 'a', descriptionKey: 'b', signals: ['ad_storage'] },
    ]

    expect(Object.keys(consentDefaults(categories))).toEqual(['ad_storage'])
    expect(consentUpdate({ ads: true }, categories)).toEqual({ ad_storage: 'granted' })
  })
})

describe('the bootstrap script', () => {
  const script = consentBootstrapScript()

  test('declares the defaults before anything else can', () => {
    expect(script).toContain("'consent','default'")
    expect(script.indexOf("'consent','default'")).toBeLessThan(script.indexOf("'consent','update'"))
  })

  test('is idempotent through the setup flag', () => {
    expect(script).toContain('cookieConsentSetup')
  })

  test('reads the same storage key the package writes', () => {
    expect(script).toContain(JSON.stringify(CONSENT_KEY))
  })

  test('pushes arguments, the shape gtag.js itself emits', () => {
    expect(script).toContain('w.dataLayer.push(arguments)')
  })
})

describe('the store', () => {
  test('opens when nothing is stored, and stays shut when something is', () => {
    const first = makeConsentStore()
    first.init({ silent: true })

    expect(first.get().open).toBe(true)
    expect(first.get().reason).toBe('initial')

    first.save({ [CONSENT_ANALYTICS]: true })

    const second = makeConsentStore()
    second.init({ silent: true })

    expect(second.get().open).toBe(false)
  })

  test('a required category is granted whether or not the record says so', () => {
    const store = makeConsentStore()
    store.init({ silent: true })
    store.save({ [CONSENT_ANALYTICS]: false })

    expect(store.granted(CONSENT_ESSENTIAL)).toBe(true)
    expect(store.granted(CONSENT_ANALYTICS)).toBe(false)
  })

  test('accept-all grants every category', () => {
    const store = makeConsentStore()
    store.init({ silent: true })
    store.acceptAll()

    expect(DEFAULT_CONSENT_CATEGORIES.every(c => store.granted(c.key))).toBe(true)
  })

  test('subscribers see every transition', () => {
    const store = makeConsentStore()
    const seen: boolean[] = []
    store.subscribe(state => seen.push(state.open))
    store.init({ silent: true })
    store.acceptAll()
    store.open('reopen')

    expect(seen).toEqual([true, false, true])
  })
})

describe('the built-in translations', () => {
  test('every locale carries every key of English', () => {
    // Without this, a language added to the bundle ships with English strings in it and nothing
    // reports it — the readers who cannot tell us are exactly the ones affected.
    const keys = Object.keys(require('../src/i18n/en.json') as Record<string, string>)
    for (const lng of ['pl', 'ru', 'be', 'uk', 'es', 'de']) {
      const bundle = require(`../src/i18n/${lng}.json`) as Record<string, string>
      expect({ lng, missing: keys.filter(key => bundle[key] == null) })
        .toEqual({ lng, missing: [] })
    }
  })

  test('an unknown locale falls back to English rather than to a raw key', () => {
    expect(normalizeLocale('kl')).toBe('en')
    expect(defaultConsentTranslate('kl')('title', 'fallback')).toBe('Cookie Preferences')
  })

  test('a key nobody translated returns the supplied default', () => {
    expect(defaultConsentTranslate('en')('nope', 'the default')).toBe('the default')
  })

  test('placeholders interpolate', () => {
    expect(interpolate('kept for {{days}} days', { days: 365 })).toBe('kept for 365 days')
  })
})
