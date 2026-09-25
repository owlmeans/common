import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  CONSENT_ANALYTICS, CONSENT_ESSENTIAL, CONSENT_FUNCTIONAL, CONSENT_KEY, CONSENT_LANGUAGE_EVENT,
  CONSENT_LANGUAGE_KEY, CONSENT_MARKETING, CONSENT_PENDING_LANGUAGE, DEFAULT_CONSENT_CATEGORIES,
} from '../src/consts.js'
import { consentBootstrapScript } from '../src/gtm.js'
import {
  consentLinker, consentLinkerScript, decodeConsentLink, encodeConsentLink, stripConsentLinkParam, writeConsentLanguage,
  CONSENT_LINK_MAX_AGE, CONSENT_LINK_PARAM,
} from '../src/linker.js'
import { adoptConsentLanguage, consentDomains, decorateConsentUrl, registerConsentPlugin } from '../src/plugins.js'
import { makeConsentStore } from '../src/store.js'
import { consentAllowsScript, functionalGranted, functionalKeysOf, writeFunctionalPreference } from '../src/functional.js'
import { readConsent, writeConsent } from '../src/storage.js'
import type { ConsentRecord } from '../src/types.js'

/** A minimal browser: storage, a settable referrer, and a `location`/`history` pair that actually
 * track `replaceState`, so stripping can be asserted on what the URL becomes. */
const browser = () => {
  const store = new Map<string, string>()
  let cookie = ''
  let current = new URL('https://platform.test/dispatcher')
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as any).document = {
    referrer: '',
    documentElement: { lang: '' },
    get cookie() { return cookie },
    set cookie(value: string) {
      const [pair] = value.split(';')
      cookie = cookie === '' ? pair : `${cookie}; ${pair}`
    },
    // `consentLinker().start()` registers listeners on init; nothing here dispatches a click, so a
    // no-op is enough to let `store.init`/`startConsentPlugins` run without throwing.
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as any).location = new Proxy({}, {
    get: (_t, prop) => (current as unknown as Record<string, unknown>)[prop as string],
  })
  ;(globalThis as any).history = {
    state: null,
    replaceState: (_state: unknown, _title: string, next: string) => {
      current = new URL(next, current.origin)
    },
  }
  ;(globalThis as any).window = globalThis

  return {
    store,
    goto: (href: string, referrer = '') => {
      current = new URL(href)
      ;(globalThis as any).document.referrer = referrer
    },
    href: () => current.toString(),
    lang: (value: string) => { (globalThis as any).document.documentElement.lang = value },
    reset: () => {
      store.clear(); cookie = ''; (globalThis as any).document.referrer = ''; (globalThis as any).document.documentElement.lang = ''
    },
  }
}

const env = browser()
const DOMAINS = ['platform.test', 'site.test']
const linkerOpts = { linker: { domains: DOMAINS } }

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

beforeEach(() => {
  env.reset()
  env.goto('https://platform.test/dispatcher')
  delete (globalThis as any).dataLayer
  delete (globalThis as any).cookieConsentSetup
  delete (globalThis as any)[CONSENT_PENDING_LANGUAGE]
})

describe('encodeConsentLink / decodeConsentLink', () => {
  test('round-trips a record through the optional categories only', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }
    const encoded = encodeConsentLink(record)
    const decoded = decodeConsentLink(encoded)

    expect(decoded?.v).toBe(2)
    expect(decoded?.c).toEqual({ [CONSENT_FUNCTIONAL]: 0, [CONSENT_ANALYTICS]: 1, [CONSENT_MARKETING]: 0 })
    expect(decoded?.t).toBeGreaterThan(0)
  })

  test('rejects garbage rather than throwing', () => {
    expect(decodeConsentLink('not-base64url-json')).toBeNull()
    expect(decodeConsentLink('')).toBeNull()
  })

  test('rejects a payload of the wrong version', () => {
    const bad = Buffer.from(JSON.stringify({ v: 1, c: {}, t: nowSeconds() })).toString('base64url')

    expect(decodeConsentLink(bad)).toBeNull()
  })
})

describe('consentLinker().decorate', () => {
  const plugin = consentLinker()
  const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }

  test('decorates a listed, foreign host', () => {
    const decorated = plugin.decorate!(new URL('https://site.test/legal/cookies'), record, linkerOpts)

    expect(decorated).not.toBeNull()
    const payload = decodeConsentLink(decorated!.searchParams.get(CONSENT_LINK_PARAM)!)
    expect(payload?.c[CONSENT_ANALYTICS]).toBe(1)
  })

  test('leaves the current host alone', () => {
    expect(plugin.decorate!(new URL('https://platform.test/account'), record, linkerOpts)).toBeNull()
  })

  test('leaves an unlisted host alone', () => {
    expect(plugin.decorate!(new URL('https://elsewhere.test/'), record, linkerOpts)).toBeNull()
  })

  test('replaces a stale parameter rather than appending a second one', () => {
    const stale = new URL('https://site.test/legal/cookies?owlcc=stale-value')
    const decorated = plugin.decorate!(stale, record, linkerOpts)!

    expect(decorated.searchParams.getAll(CONSENT_LINK_PARAM)).toHaveLength(1)
    expect(decorated.searchParams.get(CONSENT_LINK_PARAM)).not.toBe('stale-value')
  })

  test('no-ops with no linker configured', () => {
    expect(plugin.decorate!(new URL('https://site.test/'), record, {})).toBeNull()
  })
})

describe('consentLinker().adopt — every trust rule', () => {
  const plugin = consentLinker()
  const valid = () => encodeConsentLink({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })

  test('adopts a fresh, referred, fully-covered decision', () => {
    env.goto(`https://platform.test/dispatcher?owlcc=${valid()}`, 'https://site.test/')

    const adopted = plugin.adopt!(linkerOpts)
    expect(adopted?.[CONSENT_ESSENTIAL]).toBe(true)
    expect(adopted?.[CONSENT_ANALYTICS]).toBe(true)
    expect(adopted?.[CONSENT_MARKETING]).toBe(false)
  })

  test('refuses with no parameter at all', () => {
    env.goto('https://platform.test/dispatcher', 'https://site.test/')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses with no referrer', () => {
    env.goto(`https://platform.test/dispatcher?owlcc=${valid()}`, '')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses a referrer that is not a listed domain', () => {
    env.goto(`https://platform.test/dispatcher?owlcc=${valid()}`, 'https://evil.test/')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses a stale link past maxAge', () => {
    const stale = Buffer.from(JSON.stringify({
      v: 2, c: { [CONSENT_ANALYTICS]: 1, [CONSENT_MARKETING]: 0 }, t: nowSeconds() - CONSENT_LINK_MAX_AGE - 30,
    })).toString('base64url')
    env.goto(`https://platform.test/dispatcher?owlcc=${stale}`, 'https://site.test/')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses a timestamp too far in the future for clock skew', () => {
    const future = Buffer.from(JSON.stringify({
      v: 2, c: { [CONSENT_ANALYTICS]: 1, [CONSENT_MARKETING]: 0 }, t: nowSeconds() + 3600,
    })).toString('base64url')
    env.goto(`https://platform.test/dispatcher?owlcc=${future}`, 'https://site.test/')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses a payload missing one of this site\'s optional categories', () => {
    const partial = Buffer.from(JSON.stringify({
      v: 2, c: { [CONSENT_ANALYTICS]: 1 }, t: nowSeconds(),
    })).toString('base64url')
    env.goto(`https://platform.test/dispatcher?owlcc=${partial}`, 'https://site.test/')

    expect(plugin.adopt!(linkerOpts)).toBeNull()
  })

  test('refuses with no linker configured', () => {
    env.goto(`https://platform.test/dispatcher?owlcc=${valid()}`, 'https://site.test/')

    expect(plugin.adopt!({})).toBeNull()
  })
})

describe('stripConsentLinkParam', () => {
  test('removes only the parameter, keeping the rest and the hash', () => {
    env.goto('https://platform.test/dispatcher?owlcc=abc&next=%2Fhome&ref=site#panel')
    stripConsentLinkParam(linkerOpts)

    expect(env.href()).toBe('https://platform.test/dispatcher?next=%2Fhome&ref=site#panel')
  })

  test('is a no-op with no parameter present', () => {
    env.goto('https://platform.test/dispatcher?next=%2Fhome')
    stripConsentLinkParam(linkerOpts)

    expect(env.href()).toBe('https://platform.test/dispatcher?next=%2Fhome')
  })

  test('is a no-op with no linker configured', () => {
    env.goto('https://platform.test/dispatcher?owlcc=abc')
    stripConsentLinkParam({})

    expect(env.href()).toBe('https://platform.test/dispatcher?owlcc=abc')
  })
})

describe('consentDomains / decorateConsentUrl (registry level)', () => {
  test('discloses the current host plus every plugin-named domain, deduplicated', () => {
    registerConsentPlugin(consentLinker())
    const domains = consentDomains(linkerOpts)

    expect(domains).toContain('platform.test')
    expect(domains).toContain('site.test')
    expect(new Set(domains).size).toBe(domains.length)
  })

  test('decorateConsentUrl applies the registered plugin to a plain URL', () => {
    registerConsentPlugin(consentLinker())
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false }
    const decorated = decorateConsentUrl('https://site.test/legal/cookies', record, linkerOpts)

    expect(decorated.searchParams.has(CONSENT_LINK_PARAM)).toBe(true)
  })

  test('registering the same alias twice replaces rather than duplicates', () => {
    registerConsentPlugin(consentLinker())
    registerConsentPlugin(consentLinker())
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true }
    const decorated = decorateConsentUrl('https://site.test/', record, linkerOpts)

    // A duplicate `decorate` implementation would still be idempotent (same value both times), so
    // what this actually guards is that the registry never grows unbounded per alias.
    expect(decorated.searchParams.getAll(CONSENT_LINK_PARAM)).toHaveLength(1)
  })
})

describe('the store, with a linker configured', () => {
  test('adopts on init when nothing is stored yet, and applies it', () => {
    const record = { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }
    env.goto(`https://platform.test/dispatcher?owlcc=${encodeConsentLink(record)}`, 'https://site.test/')

    const store = makeConsentStore()
    store.init({ silent: true, linker: { domains: DOMAINS } })

    expect(store.get().open).toBe(false)
    expect(store.get().record?.[CONSENT_ANALYTICS]).toBe(true)
    expect(store.granted(CONSENT_ESSENTIAL)).toBe(true)
    // Written through, not just held in memory — a second page load must see it too.
    expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('strips the parameter from the URL either way', () => {
    env.goto('https://platform.test/dispatcher?owlcc=whatever-not-even-valid')

    const store = makeConsentStore()
    store.init({ silent: true, linker: { domains: DOMAINS } })

    expect(env.href()).toBe('https://platform.test/dispatcher')
  })

  test('never overwrites a decision this document already made', () => {
    writeConsent({ [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    const incoming = { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true }
    env.goto(`https://platform.test/dispatcher?owlcc=${encodeConsentLink(incoming)}`, 'https://site.test/')

    const store = makeConsentStore()
    store.init({ silent: true, linker: { domains: DOMAINS } })

    expect(store.get().record?.[CONSENT_ANALYTICS]).toBe(false)
  })

  test('opens as usual when adoption is refused and nothing is stored', () => {
    env.goto('https://platform.test/dispatcher', '')

    const store = makeConsentStore()
    store.init({ silent: true, linker: { domains: DOMAINS } })

    expect(store.get().open).toBe(true)
    expect(store.get().reason).toBe('initial')
  })
})

describe('consentBootstrapScript with a linker: order and shape', () => {
  test('the linker fragment sits after the default push and before the storage read', () => {
    const script = consentBootstrapScript({ linker: { domains: DOMAINS } })
    const defaultAt = script.indexOf("'consent','default'")
    const linkerAt = script.indexOf('URLSearchParams')
    const storageAt = script.indexOf('w.localStorage.getItem')

    expect(defaultAt).toBeGreaterThan(-1)
    expect(linkerAt).toBeGreaterThan(defaultAt)
    expect(storageAt).toBeGreaterThan(linkerAt)
  })

  test('emits nothing extra with no linker configured', () => {
    expect(consentBootstrapScript()).not.toContain('URLSearchParams')
  })

  test('escapes "<" inside embedded strings', () => {
    const script = consentLinkerScript({ linker: { domains: ['<script>evil.test'] } })

    expect(script).not.toContain('<script>evil.test')
    expect(script).toContain('\\u003cscript>evil.test')
  })
})

describe('consentLinkerScript, executed', () => {
  test('adopts a valid link and strips the parameter, via new Function', () => {
    const record = { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }
    env.goto(`https://platform.test/dispatcher?owlcc=${encodeConsentLink(record)}`, 'https://site.test/')

    const script = consentLinkerScript({ linker: { domains: DOMAINS } })
    // eslint-disable-next-line no-new-func
    new Function(script)()

    expect(env.href()).toBe('https://platform.test/dispatcher')
    expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('never overwrites an existing record, and still strips', () => {
    writeConsent({ [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    const incoming = { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true }
    env.goto(`https://platform.test/dispatcher?owlcc=${encodeConsentLink(incoming)}`, 'https://site.test/')

    const script = consentLinkerScript({ linker: { domains: DOMAINS } })
    // eslint-disable-next-line no-new-func
    new Function(script)()

    expect(env.href()).toBe('https://platform.test/dispatcher')
    expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(false)
  })

  test('is an empty string with no linker configured', () => {
    expect(consentLinkerScript({})).toBe('')
  })
})

describe('every category the built-in bundle carries', () => {
  test('DEFAULT_CONSENT_CATEGORIES still has exactly one required (essential) category', () => {
    // Sanity check the fixture the tests above lean on: if this ever changes, the "every local
    // optional category" adopt rule above is exercised against a different set than intended.
    expect(DEFAULT_CONSENT_CATEGORIES.filter(c => c.required === true).map(c => c.key)).toEqual([CONSENT_ESSENTIAL])
  })

  test('functional is an optional category that drives no Consent Mode signal', () => {
    const functional = DEFAULT_CONSENT_CATEGORIES.find(c => c.key === CONSENT_FUNCTIONAL)

    expect(functional).toBeDefined()
    expect(functional?.required).not.toBe(true)
    expect(functional?.signals ?? []).toEqual([])
  })
})

describe('language: the link parameter', () => {
  const withLanguage = { linker: { domains: DOMAINS, language: {} } }

  test('carries the page language as `l`, lower-cased, when the sender turned it on', () => {
    env.lang('PL')
    const decoded = decodeConsentLink(encodeConsentLink({ [CONSENT_ANALYTICS]: true }, withLanguage))

    expect(decoded?.l).toBe('pl')
    expect(decoded?.c).toEqual({ [CONSENT_FUNCTIONAL]: 0, [CONSENT_ANALYTICS]: 1, [CONSENT_MARKETING]: 0 })
  })

  test('carries no `l` when the sender did not turn it on, whatever the page says', () => {
    env.lang('pl')

    expect(decodeConsentLink(encodeConsentLink({ [CONSENT_ANALYTICS]: true }, linkerOpts))?.l).toBeUndefined()
  })

  test('carries no `l` for a page with no usable language', () => {
    for (const lang of ['', 'not a language!', '12']) {
      env.lang(lang)

      expect(decodeConsentLink(encodeConsentLink(null, withLanguage))?.l).toBeUndefined()
    }
  })

  test('encodes no decision at all as an empty `c`', () => {
    env.lang('de')
    const decoded = decodeConsentLink(encodeConsentLink(null, withLanguage))

    expect(decoded?.c).toEqual({})
    expect(decoded?.l).toBe('de')
  })

  test('a malformed `l` is dropped without refusing the decision beside it', () => {
    const raw = Buffer.from(JSON.stringify({
      v: 2, c: { [CONSENT_ANALYTICS]: 1 }, t: nowSeconds(), l: '../../etc',
    })).toString('base64url')
    const decoded = decodeConsentLink(raw)

    expect(decoded).not.toBeNull()
    expect(decoded?.l).toBeUndefined()
    expect(decoded?.c[CONSENT_ANALYTICS]).toBe(1)
  })
})

describe('language: consentLinker().decorate', () => {
  const plugin = consentLinker()
  const withLanguage = { linker: { domains: DOMAINS, language: {} } }
  const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }

  test('decorates with the language alone before any decision was made', () => {
    env.lang('uk')
    const decorated = plugin.decorate!(new URL('https://site.test/start'), null, withLanguage)

    expect(decorated).not.toBeNull()
    const payload = decodeConsentLink(decorated!.searchParams.get(CONSENT_LINK_PARAM)!)
    expect(payload?.l).toBe('uk')
    expect(payload?.c).toEqual({})
  })

  test('carries the decision and the language together', () => {
    env.lang('pl')
    const payload = decodeConsentLink(
      plugin.decorate!(new URL('https://site.test/start'), record, withLanguage)!.searchParams.get(CONSENT_LINK_PARAM)!
    )

    expect(payload?.l).toBe('pl')
    expect(payload?.c[CONSENT_ANALYTICS]).toBe(1)
  })

  test('has nothing to say without a decision and without the language turned on', () => {
    env.lang('pl')

    expect(plugin.decorate!(new URL('https://site.test/start'), null, linkerOpts)).toBeNull()
  })

  test('has nothing to say without a decision when the page names no language', () => {
    env.lang('')

    expect(plugin.decorate!(new URL('https://site.test/start'), null, withLanguage)).toBeNull()
  })

  test('still refuses an unlisted host, language or not', () => {
    env.lang('pl')

    expect(plugin.decorate!(new URL('https://elsewhere.test/'), record, withLanguage)).toBeNull()
  })
})

describe('language: consentLinker().adoptLanguage', () => {
  const plugin = consentLinker()
  const receiving = { linker: { domains: DOMAINS, language: { supported: ['en', 'pl', 'de', 'fr'] } } }
  const carried = (lang: string, record: ConsentRecord | null = null): string => {
    env.lang(lang)

    return encodeConsentLink(record, { linker: { domains: DOMAINS, language: {} } })
  }
  const arrive = (owlcc: string, referrer = 'https://site.test/') => {
    env.goto(`https://platform.test/dispatcher?owlcc=${owlcc}`, referrer)
    env.lang('en')
  }

  test('adopts a supported language', () => {
    arrive(carried('pl'))

    expect(plugin.adoptLanguage!(receiving)).toBe('pl')
  })

  test('matches a regional tag by its base', () => {
    arrive(carried('de-AT'))

    expect(plugin.adoptLanguage!(receiving)).toBe('de')
  })

  test('answers with the receiver\'s own spelling of the language', () => {
    arrive(carried('pl'))

    expect(plugin.adoptLanguage!({ linker: { domains: DOMAINS, language: { supported: ['PL'] } } })).toBe('PL')
  })

  test('ignores a language the application cannot render', () => {
    arrive(carried('ja'))

    expect(plugin.adoptLanguage!(receiving)).toBeNull()
  })

  test('a site that only sends never adopts', () => {
    arrive(carried('pl'))

    expect(plugin.adoptLanguage!({ linker: { domains: DOMAINS, language: {} } })).toBeNull()
    expect(plugin.adoptLanguage!(linkerOpts)).toBeNull()
  })

  test('shares the consent trust rule: a foreign referrer, a stale link and no referrer all refuse', () => {
    arrive(carried('pl'), 'https://evil.test/')
    expect(plugin.adoptLanguage!(receiving)).toBeNull()

    arrive(carried('pl'), '')
    expect(plugin.adoptLanguage!(receiving)).toBeNull()

    const stale = Buffer.from(JSON.stringify({
      v: 2, c: {}, t: nowSeconds() - CONSENT_LINK_MAX_AGE - 30, l: 'pl',
    })).toString('base64url')
    arrive(stale)
    expect(plugin.adoptLanguage!(receiving)).toBeNull()
  })

  test('a language-only link carries no decision: `adopt` defers while `adoptLanguage` answers', () => {
    arrive(carried('pl'))

    expect(plugin.adopt!(receiving)).toBeNull()
    expect(plugin.adoptLanguage!(receiving)).toBe('pl')
  })

  test('a receiver that predates the language field still adopts the decision from the same link', () => {
    arrive(carried('pl', { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }))

    expect(plugin.adopt!(linkerOpts)?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('registry: adoptConsentLanguage asks the registered plugin', () => {
    registerConsentPlugin(consentLinker())
    arrive(carried('pl'))

    expect(adoptConsentLanguage(receiving)).toBe('pl')
    expect(adoptConsentLanguage(linkerOpts)).toBeNull()
  })
})

describe('language: only while functional storage is granted', () => {
  const receiving = { silent: true, linker: { domains: DOMAINS, language: { supported: ['en', 'pl', 'de'] } } }
  const arrive = (lang: string, record: ConsentRecord | null = null, referrer = 'https://site.test/') => {
    env.lang(lang)
    const owlcc = encodeConsentLink(record, { linker: { domains: DOMAINS, language: {} } })
    env.goto(`https://platform.test/dispatcher?owlcc=${owlcc}`, referrer)
    env.lang('en')
  }
  /** A decision that allows remembering a preference, and one that refuses everything optional. */
  const granted: ConsentRecord = { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false }
  const refused: ConsentRecord = { [CONSENT_FUNCTIONAL]: false, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false }
  const legacy: ConsentRecord = { [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }

  test('writeConsentLanguage writes only on a functional grant, and says so', () => {
    expect(writeConsentLanguage('pl', receiving)).toBe(false)

    writeConsent(refused)
    expect(writeConsentLanguage('pl', receiving)).toBe(false)

    writeConsent(legacy)
    expect(writeConsentLanguage('pl', receiving)).toBe(false)
    expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)

    writeConsent(granted)
    expect(writeConsentLanguage('pl', receiving)).toBe(true)
    expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
  })

  test('a grant that survives only in the cookie counts; a corrupt record does not', () => {
    env.store.set(CONSENT_KEY, '{not json')
    expect(writeConsentLanguage('pl', receiving)).toBe(false)

    env.reset()
    ;(globalThis as any).document.cookie = `${CONSENT_KEY}=${JSON.stringify({ v: 2, essential: true, ...granted })}`
    expect(writeConsentLanguage('pl', receiving)).toBe(true)
    expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
  })

  test('functionalGranted, writeFunctionalPreference and functionalKeysOf agree with the record', () => {
    expect(functionalGranted()).toBe(false)
    expect(writeFunctionalPreference('theme-choice', 'dark')).toBe(false)

    writeConsent(granted)
    expect(functionalGranted()).toBe(true)
    expect(writeFunctionalPreference('theme-choice', 'dark')).toBe(true)
    expect(env.store.get('theme-choice')).toBe('dark')

    expect(functionalKeysOf()).toEqual([CONSENT_LANGUAGE_KEY])
    expect(functionalKeysOf({ functionalKeys: ['a', 'b'], linker: { domains: DOMAINS, language: { storageKey: 'a' } } }))
      .toEqual(['a', 'b'])
  })

  describe('the store', () => {
    test('with no decision the language is NOT stored — it is held in memory, the dialog asks, the parameter is stripped', () => {
      arrive('pl')

      const store = makeConsentStore()
      store.init(receiving)

      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(store.pendingLanguage()).toBe('pl')
      expect(store.get().open).toBe(true)
      expect(env.href()).toBe('https://platform.test/dispatcher')
    })

    test('answering the dialog AFTER arrival stores the waiting language on a grant, and tells the app', () => {
      arrive('pl')
      const store = makeConsentStore()
      store.init(receiving)
      const heard: string[] = []
      // Process-wide globals: put them back, whatever the assertions do (bun shares them across files).
      const saved = { dispatch: (globalThis as any).dispatchEvent, custom: (globalThis as any).CustomEvent }
      ;(globalThis as any).dispatchEvent = (e: any) => { if (e.type === CONSENT_LANGUAGE_EVENT) heard.push(e.detail.language) }
      ;(globalThis as any).CustomEvent = class { constructor(public type: string, public init: any) {} get detail() { return this.init.detail } }
      try {
        store.save(granted)
      } finally {
        (globalThis as any).dispatchEvent = saved.dispatch
        ;(globalThis as any).CustomEvent = saved.custom
      }

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
      expect(store.pendingLanguage()).toBeNull()
      expect(heard).toEqual(['pl'])
    })

    test('answering with a refusal stores nothing, and the language keeps waiting for a later grant', () => {
      arrive('pl')
      const store = makeConsentStore()
      store.init(receiving)

      store.save(refused)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(store.pendingLanguage()).toBe('pl')

      store.save(granted)
      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
    })

    test('a decision carried by the link that grants functional stores decision and language together', () => {
      arrive('de', { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })

      const store = makeConsentStore()
      store.init(receiving)

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('de')
      expect(store.get().open).toBe(false)
      expect(store.get().record?.[CONSENT_ANALYTICS]).toBe(true)
    })

    test('a carried "reject all" stores the decision but NOT the language', () => {
      arrive('de', refused)

      const store = makeConsentStore()
      store.init(receiving)

      expect(store.get().open).toBe(false)
      expect(store.get().record?.[CONSENT_FUNCTIONAL]).toBe(false)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(store.pendingLanguage()).toBe('de')
    })

    test('a functional grant stored here is enough for a link that carries only the language', () => {
      writeConsent(granted)
      arrive('pl')

      makeConsentStore().init(receiving)

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
    })

    test('the carried language outranks one chosen here earlier, while a stored decision still wins', () => {
      writeConsent(granted)
      env.store.set(CONSENT_LANGUAGE_KEY, 'de')
      arrive('pl', { [CONSENT_FUNCTIONAL]: false, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })

      const store = makeConsentStore()
      store.init(receiving)

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
      expect(store.get().record?.[CONSENT_ANALYTICS]).toBe(false)
    })

    test('no functional grant removes a language stored earlier — on init, and on a refusal', () => {
      env.store.set(CONSENT_LANGUAGE_KEY, 'de')
      const store = makeConsentStore()
      store.init(receiving)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)

      store.save(granted)
      env.store.set(CONSENT_LANGUAGE_KEY, 'de')
      store.save(refused)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
    })

    test('a grant keeps what is stored, and every functional key is purged when it is withdrawn', () => {
      writeConsent(granted)
      env.store.set(CONSENT_LANGUAGE_KEY, 'de')
      env.store.set('locale_chosen', '1')
      const opts = { ...receiving, functionalKeys: [CONSENT_LANGUAGE_KEY, 'locale_chosen'] }
      const store = makeConsentStore()
      store.init(opts)
      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('de')
      expect(env.store.get('locale_chosen')).toBe('1')

      store.save(refused)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(env.store.has('locale_chosen')).toBe(false)
    })

    test('a record saved before the category existed is not a grant', () => {
      writeConsent(legacy)
      env.store.set(CONSENT_LANGUAGE_KEY, 'de')
      arrive('pl')

      const store = makeConsentStore()
      store.init(receiving)

      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(store.pendingLanguage()).toBe('pl')
    })

    test('honours a custom storage key', () => {
      writeConsent(granted)
      arrive('pl')

      makeConsentStore().init({ ...receiving, linker: { ...receiving.linker, language: { supported: ['pl'], storageKey: 'app-lng' } } })

      expect(env.store.get('app-lng')).toBe('pl')
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
    })

    test('writes nothing for an unsupported language or an untrusted referrer, grant or not', () => {
      writeConsent(granted)
      arrive('ja')
      makeConsentStore().init(receiving)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)

      arrive('pl', null, 'https://evil.test/')
      const store = makeConsentStore()
      store.init(receiving)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(store.pendingLanguage()).toBeNull()
    })

    test('picks up what the inline fragment left on window, and clears it', () => {
      ;(globalThis as any)[CONSENT_PENDING_LANGUAGE] = 'pl'
      env.goto('https://platform.test/dispatcher')

      const store = makeConsentStore()
      store.init(receiving)

      expect(store.pendingLanguage()).toBe('pl')
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBeUndefined()

      store.save(granted)
      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
    })
  })

  describe('the inline fragment', () => {
    const run = (opts: Parameters<typeof consentLinkerScript>[0] = receiving) => {
      // eslint-disable-next-line no-new-func
      new Function(consentLinkerScript(opts))()
    }
    const all = { linker: { domains: DOMAINS, language: { supported: ['en', 'pl', 'de', 'fr'] } } }

    test('with no decision anywhere it writes NO language, leaves it on window, adopts nothing, and still strips', () => {
      arrive('pl')
      run()

      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBe('pl')
      expect(readConsent()).toBeNull()
      expect(env.href()).toBe('https://platform.test/dispatcher')
    })

    test('a link that grants functional writes decision and language together', () => {
      arrive('fr', { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })
      run(all)

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('fr')
      expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(true)
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBeUndefined()
    })

    test('a link that carries "reject all" adopts the decision but keeps the language in memory only', () => {
      arrive('fr', refused)
      run(all)

      expect(readConsent()?.[CONSENT_FUNCTIONAL]).toBe(false)
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBe('fr')
    })

    test('a functional grant stored here is enough, and the link\'s own decision never overwrites it', () => {
      writeConsent({ ...granted, [CONSENT_ANALYTICS]: false })
      arrive('de', { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
      run()

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('de')
      expect(readConsent()?.[CONSENT_ANALYTICS]).toBe(false)
    })

    test('a functional grant stored here is enough for a link that carries only the language', () => {
      writeConsent(granted)
      arrive('pl')
      run()

      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('pl')
    })

    test('a stored refusal or a legacy record is not a grant: nothing written, language kept in memory', () => {
      for (const record of [refused, legacy]) {
        env.reset()
        delete (globalThis as any)[CONSENT_PENDING_LANGUAGE]
        writeConsent(record)
        arrive('pl')
        run()

        expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
        expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBe('pl')
      }
    })

    test('an unparseable stored record is no grant: nothing is written, and nothing is adopted over it', () => {
      env.store.set(CONSENT_KEY, '{not json')
      arrive('pl', { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
      run()

      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect(env.store.get(CONSENT_KEY)).toBe('{not json')
    })

    test('matches by base tag and by the receiver\'s spelling, like the TypeScript path', () => {
      const grant = { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false }
      arrive('de-CH', grant)
      run()
      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('de')

      env.reset()
      arrive('pl', grant)
      run({ linker: { domains: DOMAINS, language: { supported: ['PL'] } } })
      expect(env.store.get(CONSENT_LANGUAGE_KEY)).toBe('PL')
    })

    test('agrees with the TypeScript path on what it refuses, grant or not', () => {
      writeConsent(granted)
      arrive('ja')
      run()
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)

      delete (globalThis as any)[CONSENT_PENDING_LANGUAGE]
      arrive('pl', null, 'https://evil.test/')
      run()
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBeUndefined()

      arrive('pl', null, '')
      run()
      expect(env.store.has(CONSENT_LANGUAGE_KEY)).toBe(false)
      expect((globalThis as any)[CONSENT_PENDING_LANGUAGE]).toBeUndefined()
    })

    test('honours a custom storage key', () => {
      arrive('pl', { [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })
      run({ linker: { domains: DOMAINS, language: { supported: ['pl'], storageKey: 'app-lng' } } })

      expect(env.store.get('app-lng')).toBe('pl')
    })

    test('a page that only sends carries no language code at all', () => {
      const script = consentLinkerScript({ linker: { domains: DOMAINS, language: {} } })

      expect(script).not.toContain(CONSENT_LANGUAGE_KEY)
      expect(script).not.toContain(CONSENT_PENDING_LANGUAGE)
      expect(consentLinkerScript(linkerOpts)).toBe(script)
    })

    test('the bootstrap embeds it, after the decision is settled and before its own storage read', () => {
      const script = consentBootstrapScript(receiving)

      expect(script.indexOf(CONSENT_LANGUAGE_KEY)).toBeGreaterThan(script.indexOf("'consent','default'"))
      // The fragment reads storage itself (to know what is granted) before it writes the language;
      // the bootstrap's own read is the LAST one, after the whole fragment.
      expect(script.indexOf(CONSENT_LANGUAGE_KEY)).toBeLessThan(script.lastIndexOf('w.localStorage.getItem'))
    })

    test('escapes "<" in a configured language too', () => {
      const script = consentLinkerScript({ linker: { domains: DOMAINS, language: { supported: ['<b>'], storageKey: '<k>' } } })

      expect(script).not.toContain('<b>')
      expect(script).not.toContain('<k>')
    })
  })
})

describe('consentAllowsScript, executed', () => {
  const run = (opts?: Parameters<typeof consentAllowsScript>[0]) => {
    // eslint-disable-next-line no-new-func
    new Function(consentAllowsScript(opts))()

    return (globalThis as any).owlConsentAllows as (category: string) => boolean
  }
  afterEach(() => { delete (globalThis as any).owlConsentAllows })

  test('answers from the stored record, category by category', () => {
    writeConsent({ [CONSENT_FUNCTIONAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    const allows = run()

    expect(allows(CONSENT_FUNCTIONAL)).toBe(true)
    expect(allows(CONSENT_ANALYTICS)).toBe(false)
    expect(allows('unknown')).toBe(false)
  })

  test('no record, a legacy record and a corrupt one are all a no', () => {
    const allows = run()
    expect(allows(CONSENT_FUNCTIONAL)).toBe(false)

    writeConsent({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
    expect(allows(CONSENT_FUNCTIONAL)).toBe(false)

    env.store.set(CONSENT_KEY, '{not json')
    expect(allows(CONSENT_FUNCTIONAL)).toBe(false)
  })

  test('reads the cookie when localStorage has nothing, and honours a custom key', () => {
    ;(globalThis as any).document.cookie = `${CONSENT_KEY}=${JSON.stringify({ v: 2, functional: true })}`
    expect(run()(CONSENT_FUNCTIONAL)).toBe(true)

    env.reset()
    env.store.set('my_consent', JSON.stringify({ v: 2, functional: true }))
    expect(run({ storageKey: 'my_consent' })(CONSENT_FUNCTIONAL)).toBe(true)
    expect(run()(CONSENT_FUNCTIONAL)).toBe(false)
  })

  test('escapes "<" in the key', () => {
    expect(consentAllowsScript({ storageKey: '<k>' })).not.toContain('<k>')
  })
})
