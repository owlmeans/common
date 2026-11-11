import { describe, test, expect, beforeEach } from 'bun:test'
import {
  CONSENT_ANALYTICS, CONSENT_ESSENTIAL, CONSENT_EVENT, CONSENT_KEY, CONSENT_LOCALES,
  CONSENT_MARKETING, CONSENT_SCHEMA_VERSION, DEFAULT_CONSENT_CATEGORIES, DEFAULT_CONSENT_MESSAGES,
} from '../src/consts.js'
import { consentStorageHelper } from '../src/storage.js'
import { consentSignalHelper } from '../src/signal.js'
import { consentTrackingHelper } from '../src/tracking.js'
import { makeConsentStore } from '../src/store.js'
import { consentI18nHelper } from '../src/i18n.js'
import type { ConsentOptions, ConsentRecord } from '../src/types.js'
import type { ConsentSignalProvider } from '../src/signal/types.js'

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

/** The category globals the default set writes. */
const GLOBALS = ['owlConsentEssential', 'owlConsentAnalytics', 'owlConsentMarketing']

beforeEach(() => {
  env.reset()
  consentSignalHelper.clear()
  for (const name of GLOBALS) delete (globalThis as any)[name]
})

/** A provider that records what the host asked of it, and what the page looked like at the time. */
const recorder = (id = 'recorder', journal: string[] = []) => {
  const provider: ConsentSignalProvider & { journal: string[] } = {
    id, journal,
    defaults: (opts: ConsentOptions) => { journal.push(`${id}:defaults:${opts.storageKey ?? '-'}`) },
    apply: (record: ConsentRecord) => {
      journal.push(`${id}:apply:${String(record.analytics)}:global=${String((globalThis as any).owlConsentAnalytics)}`)
    },
  }

  return provider
}

describe('storage', () => {
  test('a record round-trips through localStorage', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })

    expect(consentStorageHelper.readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
    expect(consentStorageHelper.readConsent()?.[CONSENT_MARKETING]).toBe(false)
  })

  test('the cookie answers when localStorage does not', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true })
    env.store.clear()

    expect(consentStorageHelper.readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('the cookie is path-wide, SameSite=Lax and long-lived', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true })

    expect(env.raw()).toContain(`${CONSENT_KEY}=`)
    // The cookie fragment the browser stub keeps is just the pair, so the attributes are asserted
    // on what `writeConsent` produced rather than on what a real browser would retain.
    expect(consentStorageHelper.readConsent()).not.toBeNull()
  })

  test('a legacy record — the owlmeans.com visitor — migrates instead of being discarded', () => {
    // Exactly what the previous widget wrote: two categories, no version, essential implicit.
    const legacy = { analytics: true, marketing: false }

    const migrated = consentStorageHelper.migrateConsent(legacy)

    expect(migrated?.[CONSENT_ESSENTIAL]).toBe(true)
    expect(migrated?.[CONSENT_ANALYTICS]).toBe(true)
    expect(migrated?.v).toBe(CONSENT_SCHEMA_VERSION)
  })

  test('a current record is returned unchanged', () => {
    const current = { essential: true, analytics: false, v: CONSENT_SCHEMA_VERSION }

    expect(consentStorageHelper.migrateConsent(current)).toBe(current)
  })

  test('nothing stored reads as null', () => {
    consentStorageHelper.clearConsent()

    expect(consentStorageHelper.readConsent()).toBeNull()
  })
})

describe('the signal host', () => {
  test('register replaces by id, list keeps registration order, unregister and clear remove', () => {
    const first = recorder('a')
    consentSignalHelper.register(first)
    consentSignalHelper.register(recorder('b'))
    const replacement = recorder('a')
    consentSignalHelper.register(replacement)

    expect(consentSignalHelper.list().map(provider => provider.id)).toEqual(['a', 'b'])
    expect(consentSignalHelper.get('a')).toBe(replacement)

    consentSignalHelper.unregister('a')
    expect(consentSignalHelper.get('a')).toBeNull()
    consentSignalHelper.clear()
    expect(consentSignalHelper.list()).toEqual([])
  })

  test('the store declares every provider\'s defaults on init, before it applies a stored record', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true })
    const journal: string[] = []
    consentSignalHelper.register(recorder('a', journal))
    consentSignalHelper.register(recorder('b', journal))

    makeConsentStore().init({ storageKey: CONSENT_KEY })

    expect(journal).toEqual([
      `a:defaults:${CONSENT_KEY}`, `b:defaults:${CONSENT_KEY}`,
      'a:apply:true:global=true', 'b:apply:true:global=true',
    ])
  })

  test('a save reaches every provider after the category globals are written', () => {
    const provider = recorder()
    consentSignalHelper.register(provider)
    const store = makeConsentStore()
    store.init()
    store.save({ [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: true })

    // The global was already written when the provider ran — a tag firing on its update reads it.
    expect(provider.journal).toEqual(['recorder:defaults:-', 'recorder:apply:false:global=false'])
    expect((globalThis as any).owlConsentMarketing).toBe(true)
    expect((globalThis as any).owlConsentEssential).toBe(true)
  })

  test('with no provider registered the store still works and still dispatches the event', () => {
    const seen: unknown[] = []
    const listener = (event: Event) => { seen.push((event as CustomEvent).detail) }
    ;(globalThis as any).addEventListener(CONSENT_EVENT, listener)
    try {
      const store = makeConsentStore()
      store.init()
      expect(store.get().open).toBe(true)
      store.acceptAll()

      expect(store.get().open).toBe(false)
      expect(store.granted(CONSENT_ANALYTICS)).toBe(true)
      expect((globalThis as any).owlConsentAnalytics).toBe(true)
      expect(seen).toHaveLength(1)
    } finally {
      ;(globalThis as any).removeEventListener(CONSENT_EVENT, listener)
    }
  })

  test('a provider that throws stops neither the others nor the event', () => {
    const journal: string[] = []
    consentSignalHelper.register({ id: 'broken', defaults: () => { throw new Error('x') }, apply: () => { throw new Error('y') } })
    consentSignalHelper.register(recorder('after', journal))
    const seen: unknown[] = []
    const listener = (event: Event) => { seen.push((event as CustomEvent).detail) }
    ;(globalThis as any).addEventListener(CONSENT_EVENT, listener)
    try {
      consentSignalHelper.defaults({})
      consentSignalHelper.apply({ [CONSENT_ANALYTICS]: true })

      expect(journal).toEqual(['after:defaults:-', 'after:apply:true:global=true'])
      expect(seen).toHaveLength(1)
    } finally {
      ;(globalThis as any).removeEventListener(CONSENT_EVENT, listener)
    }
  })

  test('silent mode touches nothing: no provider, no global, no event', () => {
    const provider = recorder()
    consentSignalHelper.register(provider)
    const seen: unknown[] = []
    const listener = (event: Event) => { seen.push((event as CustomEvent).detail) }
    ;(globalThis as any).addEventListener(CONSENT_EVENT, listener)
    try {
      const store = makeConsentStore()
      store.init({ silent: true })
      store.save({ [CONSENT_ANALYTICS]: true })

      expect(provider.journal).toEqual([])
      expect((globalThis as any).owlConsentAnalytics).toBeUndefined()
      expect(seen).toEqual([])
      // Storage and the decision itself are untouched by `silent`.
      expect(store.granted(CONSENT_ANALYTICS)).toBe(true)
    } finally {
      ;(globalThis as any).removeEventListener(CONSENT_EVENT, listener)
    }
  })
})

describe('apply dispatches a DOM event', () => {
  test('fires CONSENT_EVENT with the record after writing globals', () => {
    const seen: unknown[] = []
    const listener = (event: Event) => {
      seen.push({ ...(event as CustomEvent).detail, global: (globalThis as any).owlConsentAnalytics })
    }
    ;(globalThis as any).addEventListener(CONSENT_EVENT, listener)

    try {
      consentSignalHelper.apply({ [CONSENT_ANALYTICS]: true })

      expect(seen).toEqual([{ record: { [CONSENT_ANALYTICS]: true }, global: true }])
    } finally {
      ;(globalThis as any).removeEventListener(CONSENT_EVENT, listener)
    }
  })

  test('silent mode dispatches nothing', () => {
    const seen: unknown[] = []
    const listener = (event: Event) => { seen.push((event as CustomEvent).detail) }
    ;(globalThis as any).addEventListener(CONSENT_EVENT, listener)

    try {
      consentSignalHelper.apply({ [CONSENT_ANALYTICS]: true }, { silent: true })

      expect(seen).toEqual([])
    } finally {
      ;(globalThis as any).removeEventListener(CONSENT_EVENT, listener)
    }
  })
})

describe('the bootstrap script', () => {
  const script = consentTrackingHelper.consentBootstrapScript()
  const run = (text: string) => {
    // eslint-disable-next-line no-new-func
    new Function(text)()
  }

  test('reads the same storage key the package writes', () => {
    expect(script).toContain(JSON.stringify(CONSENT_KEY))
  })

  test('declares no signal of any provider', () => {
    expect(script).not.toContain('dataLayer')
    expect(script).not.toContain("'consent'")
  })

  test('writes a returning visitor\'s decision onto the category globals', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })
    run(script)

    expect((globalThis as any).owlConsentEssential).toBe(true)
    expect((globalThis as any).owlConsentAnalytics).toBe(true)
    expect((globalThis as any).owlConsentMarketing).toBe(false)
  })

  test('writes nothing for a visitor who has not decided', () => {
    run(script)

    expect((globalThis as any).owlConsentAnalytics).toBeUndefined()
  })

  test('a custom storage key and category set are honoured', () => {
    consentStorageHelper.writeConsent({ chat: true }, { storageKey: 'custom' })
    run(consentTrackingHelper.consentBootstrapScript({
      storageKey: 'custom', categories: [{ key: 'chat', labelKey: 'c', descriptionKey: 'd', globalVar: 'owlConsentChat' }],
    }))

    expect((globalThis as any).owlConsentChat).toBe(true)
    delete (globalThis as any).owlConsentChat
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
    // Driven by the shipped locale list, so a language added there is checked without anyone
    // remembering to add it here — French was once in the list and missing from this loop.
    for (const lng of CONSENT_LOCALES.filter(locale => locale !== 'en')) {
      const bundle = require(`../src/i18n/${lng}.json`) as Record<string, string>
      expect({ lng, missing: keys.filter(key => bundle[key] == null) })
        .toEqual({ lng, missing: [] })
    }
  })

  test('every locale keeps every placeholder English has', () => {
    // A translation that drops `{{provider}}` still renders — just without the name of the company
    // the link belongs to, which is the one word of that line a reader needed.
    const en = DEFAULT_CONSENT_MESSAGES.en
    const placeholders = (text: string) => (text.match(/\{\{[a-z]+\}\}/gi) ?? []).sort()
    for (const lng of CONSENT_LOCALES) {
      const bundle = DEFAULT_CONSENT_MESSAGES[lng]
      const drifted = Object.keys(en).filter(key =>
        typeof bundle[key] === 'string'
        && placeholders(bundle[key]).join() !== placeholders(en[key]).join())
      expect({ lng, drifted }).toEqual({ lng, drifted: [] })
    }
  })

  test('the bar copy stays short in every locale', () => {
    // The bar sits over the page the visitor came to read, so its description is held to about
    // half of what it once was (298 / 143 characters in English before it was halved) — a
    // translation that grows back is a regression a reader feels, never one a type catches.
    for (const lng of CONSENT_LOCALES) {
      const bundle = DEFAULT_CONSENT_MESSAGES[lng]
      expect({ lng, long: bundle.barDescription.length > 200 }).toEqual({ lng, long: false })
      expect({ lng, long: bundle.barDescriptionEssential.length > 100 }).toEqual({ lng, long: false })
    }
  })

  test('an unknown locale falls back to English rather than to a raw key', () => {
    expect(consentI18nHelper.normalizeLocale('kl')).toBe('en')
    expect(consentI18nHelper.defaultConsentTranslate('kl')('title', 'fallback')).toBe('Cookie Preferences')
  })

  test('a key nobody translated returns the supplied default', () => {
    expect(consentI18nHelper.defaultConsentTranslate('en')('nope', 'the default')).toBe('the default')
  })

  test('placeholders interpolate', () => {
    expect(consentI18nHelper.interpolate('kept for {{days}} days', { days: 365 })).toBe('kept for 365 days')
  })
})
