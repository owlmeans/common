import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  CONSENT_ANALYTICS, CONSENT_AUTO_MAX_AGE, CONSENT_ESSENTIAL, CONSENT_KEY, CONSENT_MARKETING,
  CONSENT_REQUIRED_COUNTRIES, CONSENT_TRACE_PATH,
} from '../src/consts.js'
import { consentGeoHelper } from '../src/geo.js'
import { consentModeHelper } from '../src/gtm.js'
import { consentLinkHelper } from '../src/linker.js'
import { consentPluginHelper } from '../src/plugins.js'
import { makeConsentStore } from '../src/store.js'
import { consentStorageHelper } from '../src/storage.js'
import type { ConsentGeoPlugin, ConsentOptions, ConsentRecord } from '../src/types.js'

/** Storage, a cookie jar, `<html>` attributes, a `location`/`history` pair and a fake trace endpoint. */
const browser = () => {
  const store = new Map<string, string>()
  const attributes = new Map<string, string>()
  let cookie = ''
  let current = new URL('https://site.test/')
  let trace: { status: number, body: string } | 'throw' | 'hang' = { status: 200, body: '' }
  const calls: { path: string, init?: RequestInit }[] = []
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as any).document = {
    referrer: '',
    documentElement: {
      lang: '',
      setAttribute: (name: string, value: string) => { attributes.set(name, value) },
    },
    get cookie() { return cookie },
    set cookie(value: string) {
      const [pair] = value.split(';')
      const [name] = pair.split('=')
      const rest = cookie === '' ? [] : cookie.split('; ').filter(entry => !entry.startsWith(`${name}=`))
      // An expired write is a removal, the way a browser treats it.
      cookie = [...rest, ...(value.includes('1970') ? [] : [pair])].join('; ')
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(globalThis as any).location = new Proxy({}, {
    get: (_t, prop) => (current as unknown as Record<string, unknown>)[prop as string],
  })
  ;(globalThis as any).history = {
    state: null,
    replaceState: (_state: unknown, _title: string, next: string) => { current = new URL(next, current.origin) },
  }
  ;(globalThis as any).window = globalThis
  ;(globalThis as any).fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    calls.push({ path, init })
    if (trace === 'throw') {
      throw new TypeError('network down')
    }
    if (trace === 'hang') {
      return await new Promise<Response>(() => {})
    }

    return new Response(trace.body, { status: trace.status })
  }

  return {
    store, attributes, calls,
    trace: (answer: typeof trace) => { trace = answer },
    located: (country: string) => {
      trace = { status: 200, body: `fl=1f1\nh=site.test\nip=203.0.113.1\nts=1\nvisit_scheme=https\ncolo=WAW\nloc=${country}\ntls=TLSv1.3\n` }
    },
    goto: (href: string, referrer = '') => {
      current = new URL(href)
      ;(globalThis as any).document.referrer = referrer
    },
    reset: () => {
      store.clear(); attributes.clear(); cookie = ''; calls.length = 0
      current = new URL('https://site.test/'); (globalThis as any).document.referrer = ''
    },
  }
}

const env = browser()
const cloudflare: ConsentOptions = { silent: true, geo: { cloudflare: true } }
const nowSeconds = (): number => Math.floor(Date.now() / 1000)
const gpc = (value: boolean | undefined): void => {
  Object.defineProperty(globalThis.navigator, 'globalPrivacyControl', { value, configurable: true })
}

beforeEach(() => {
  env.reset()
  env.located('US')
  delete (globalThis as any).dataLayer
  delete (globalThis as any).cookieConsentSetup
})

afterEach(() => {
  for (const alias of ['cloudflare', 'app-geo', 'second-geo', 'linker']) {
    consentPluginHelper.unregisterConsentPlugin(alias)
  }
  gpc(undefined)
})

describe('the country lists', () => {
  test('the EU, the UK and Switzerland ask; the United States does not', () => {
    for (const country of ['PL', 'DE', 'FR', 'IE', 'GR', 'RE', 'NO', 'GB', 'CH', 'BR']) {
      expect({ country, ask: CONSENT_REQUIRED_COUNTRIES.includes(country) }).toEqual({ country, ask: true })
    }
    for (const country of ['US', 'JP', 'AU', 'SG', 'IN', 'MX']) {
      expect({ country, ask: CONSENT_REQUIRED_COUNTRIES.includes(country) }).toEqual({ country, ask: false })
    }
  })

  test('every entry is a distinct upper-case alpha-2 code', () => {
    expect(CONSENT_REQUIRED_COUNTRIES.every(code => /^[A-Z]{2}$/.test(code))).toBe(true)
    expect(new Set(CONSENT_REQUIRED_COUNTRIES).size).toBe(CONSENT_REQUIRED_COUNTRIES.length)
  })
})

describe('consentGeoHelper', () => {
  test('parseTrace reads key=value lines, CRLF included, and nothing out of HTML', () => {
    expect(consentGeoHelper.parseTrace('fl=1\r\ncolo=WAW\r\nloc=PL\r\n')).toEqual({ fl: '1', colo: 'WAW', loc: 'PL' })
    expect(consentGeoHelper.parseTrace('<!doctype html><html lang="en"><body>app</body></html>')).toEqual({})
  })

  test('requiresConsent asks inside the list and for anything that names no country', () => {
    expect(consentGeoHelper.requiresConsent('PL')).toBe(true)
    expect(consentGeoHelper.requiresConsent('de')).toBe(true)
    expect(consentGeoHelper.requiresConsent('US')).toBe(false)
    for (const unknown of ['XX', 'T1', 'EU', '', 'USA', null]) {
      expect({ unknown, ask: consentGeoHelper.requiresConsent(unknown) }).toEqual({ unknown, ask: true })
    }
    expect(consentGeoHelper.requiresConsent('US', { geo: { countries: ['US'] } })).toBe(true)
    expect(consentGeoHelper.requiresConsent('PL', { geo: { countries: ['US'] } })).toBe(false)
  })

  test('the Cloudflare locator reads the same-origin trace, without cookies and uncached', async () => {
    env.located('PL')

    expect(await consentGeoHelper.cloudflareLocator().locate(cloudflare)).toEqual({ country: 'PL' })
    expect(env.calls[0].path).toBe(CONSENT_TRACE_PATH)
    expect(env.calls[0].init).toMatchObject({ credentials: 'omit', cache: 'no-store' })
  })

  test('the Cloudflare locator honours a path override', async () => {
    await consentGeoHelper.cloudflareLocator().locate({ geo: { cloudflare: { path: '/edge/trace' } } })

    expect(env.calls[0].path).toBe('/edge/trace')
  })

  test('the Cloudflare locator refuses a non-2xx answer, an HTML fallback page and being switched off', async () => {
    env.trace({ status: 404, body: 'not found' })
    await expect(consentGeoHelper.cloudflareLocator().locate(cloudflare)).rejects.toThrow()

    env.trace({ status: 200, body: '<!doctype html><html><body>index</body></html>' })
    await expect(consentGeoHelper.cloudflareLocator().locate(cloudflare)).rejects.toThrow()

    await expect(consentGeoHelper.cloudflareLocator().locate({ geo: {} })).rejects.toThrow()
  })

  test('locators run highest priority first, and a throw or an unusable code hands over to the next', async () => {
    const order: string[] = []
    consentPluginHelper.registerConsentPlugin({
      alias: 'app-geo', priority: 10,
      locate: async () => { order.push('app'); throw new Error('no idea') },
    } satisfies ConsentGeoPlugin)
    consentPluginHelper.registerConsentPlugin({
      alias: 'second-geo', priority: 5,
      locate: async () => { order.push('second'); return { country: 'XX' } },
    } satisfies ConsentGeoPlugin)
    consentPluginHelper.registerConsentPlugin(consentGeoHelper.cloudflareLocator())
    env.located('fr')

    expect(await consentPluginHelper.locateConsent(cloudflare)).toEqual({ country: 'FR' })
    expect(order).toEqual(['app', 'second'])
  })

  test('with no locator able to answer, locating rejects and deciding asks', async () => {
    await expect(consentPluginHelper.locateConsent(cloudflare)).rejects.toThrow()
    expect(await consentGeoHelper.decide(cloudflare)).toBe('ask')
  })

  test('decide: outside the list is automatic, inside asks, a lookup past the timeout asks', async () => {
    consentPluginHelper.registerConsentPlugin(consentGeoHelper.cloudflareLocator())
    expect(await consentGeoHelper.decide(cloudflare)).toBe('auto')

    env.located('PL')
    expect(await consentGeoHelper.decide(cloudflare)).toBe('ask')

    env.trace('hang')
    expect(await consentGeoHelper.decide({ geo: { cloudflare: true, timeout: 20 } })).toBe('ask')
  })

  test('the automatic decision grants everything, or only the required under Global Privacy Control', () => {
    const all = consentGeoHelper.automaticRecord()
    expect(all).toMatchObject({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
    expect(Math.abs((all.auto ?? 0) - nowSeconds())).toBeLessThanOrEqual(1)

    gpc(true)
    expect(consentGeoHelper.automaticRecord())
      .toMatchObject({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
  })

  test('autoState: fresh, stale, from the future, explicit', () => {
    expect(consentGeoHelper.autoState({ auto: nowSeconds() - 10 })).toBe('fresh')
    expect(consentGeoHelper.autoState({ auto: nowSeconds() - CONSENT_AUTO_MAX_AGE - 5 })).toBe('stale')
    expect(consentGeoHelper.autoState({ auto: nowSeconds() + 3600 })).toBe('stale')
    expect(consentGeoHelper.autoState({ analytics: true })).toBeNull()
    expect(consentGeoHelper.autoState(null)).toBeNull()
  })

  test('the gate is on only with geo set and something able to answer', () => {
    expect(consentGeoHelper.enabled({})).toBe(false)
    expect(consentGeoHelper.enabled({ geo: {} })).toBe(false)
    expect(consentGeoHelper.enabled(cloudflare)).toBe(true)
    consentPluginHelper.registerConsentPlugin({ alias: 'app-geo', locate: async () => ({ country: 'US' }) })
    expect(consentGeoHelper.enabled({ geo: {} })).toBe(true)
  })
})

describe('the store, with the geo gate', () => {
  test('without geo it asks at once and never fetches — unchanged', () => {
    const store = makeConsentStore()
    store.init({ silent: true })

    expect(store.get()).toMatchObject({ open: true, reason: 'initial', locating: null })
    expect(env.calls.length).toBe(0)
  })

  test('outside the list: locating first, then an automatic decision, stored and applied', async () => {
    const store = makeConsentStore()
    const seen: (string | null)[] = []
    store.subscribe(state => seen.push(state.locating))
    store.init(cloudflare)

    expect(store.get()).toMatchObject({ open: false, locating: 'first', record: null })
    expect(env.attributes.get('data-consent')).toBe('locating')

    const settled = await store.settled()

    expect(settled).toMatchObject({ open: false, locating: null })
    expect(settled.record).toMatchObject({ [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
    expect(typeof consentStorageHelper.readConsent()?.auto).toBe('number')
    expect(store.granted(CONSENT_ANALYTICS)).toBe(true)
    expect(env.attributes.get('data-consent')).toBe('decided')
    expect(seen).toEqual(['first', null])
  })

  test('inside the list it asks, and nothing is stored', async () => {
    env.located('PL')
    const store = makeConsentStore()
    store.init(cloudflare)
    await store.settled()

    expect(store.get()).toMatchObject({ open: true, reason: 'initial', record: null })
    expect(consentStorageHelper.readConsent()).toBeNull()
    expect(env.attributes.get('data-consent')).toBe('open')
  })

  test('a failed lookup asks', async () => {
    env.trace('throw')
    const store = makeConsentStore()
    store.init(cloudflare)
    await store.settled()

    expect(store.get()).toMatchObject({ open: true, reason: 'initial' })
  })

  test('Global Privacy Control: the automatic decision is mandatory-only', async () => {
    gpc(true)
    const store = makeConsentStore()
    store.init(cloudflare)
    await store.settled()

    expect(store.get().record).toMatchObject({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false })
    expect(store.granted(CONSENT_ANALYTICS)).toBe(false)
  })

  test('a decision saved while locating wins over the location', async () => {
    const store = makeConsentStore()
    store.init(cloudflare)
    store.save({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    await store.settled()

    expect(store.get().record?.[CONSENT_ANALYTICS]).toBe(false)
    expect(consentStorageHelper.readConsent()?.auto).toBeUndefined()
  })

  test('the window opened for signing in while locating is never decided over', async () => {
    const store = makeConsentStore()
    store.init(cloudflare)
    store.open('login')
    await store.settled()

    expect(store.get()).toMatchObject({ open: true, reason: 'login', record: null, locating: null })
  })

  test('a second init while locating starts no second lookup', async () => {
    const store = makeConsentStore()
    store.init(cloudflare)
    store.init(cloudflare)
    store.init({ silent: true })
    await store.settled()

    expect(env.calls.length).toBe(1)
  })

  test('an init that brings geo late takes back the ask an earlier init raised', async () => {
    const store = makeConsentStore()
    store.init({ silent: true })
    expect(store.get().open).toBe(true)

    store.init(cloudflare)
    expect(store.get()).toMatchObject({ open: false, locating: 'first' })
    await store.settled()

    expect(store.get().record?.auto).toBeNumber()
  })

  test('a fresh automatic decision is applied as it is, with no lookup', () => {
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() - 60 })
    const store = makeConsentStore()
    store.init(cloudflare)

    expect(store.get()).toMatchObject({ open: false, locating: null })
    expect(store.granted(CONSENT_ANALYTICS)).toBe(true)
    expect(env.calls.length).toBe(0)
  })

  test('an explicit decision is never located', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false })
    const store = makeConsentStore()
    store.init(cloudflare)

    expect(store.get()).toMatchObject({ open: false, locating: null })
    expect(env.calls.length).toBe(0)
  })

  test('a stale automatic decision is held back and re-checked: still outside, it is renewed', async () => {
    const stale = nowSeconds() - CONSENT_AUTO_MAX_AGE - 60
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: stale })
    const store = makeConsentStore()
    store.init(cloudflare)

    expect(store.get()).toMatchObject({ record: null, open: false, locating: 'recheck' })
    expect(store.granted(CONSENT_ANALYTICS)).toBe(false)
    await store.settled()

    expect(store.get().record?.auto).toBeGreaterThan(stale)
    expect(store.granted(CONSENT_ANALYTICS)).toBe(true)
  })

  test('a stale automatic decision met inside the list is dropped, and the visitor is asked', async () => {
    env.located('DE')
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() - CONSENT_AUTO_MAX_AGE - 60 })
    const store = makeConsentStore()
    store.init(cloudflare)
    await store.settled()

    expect(store.get()).toMatchObject({ open: true, reason: 'initial', record: null })
    expect(consentStorageHelper.readConsent()).toBeNull()
  })

  test('an explicit save drops the automatic marker', () => {
    const store = makeConsentStore()
    store.init({ silent: true })
    store.save({ ...consentGeoHelper.automaticRecord(), [CONSENT_MARKETING]: false })

    expect(store.get().record?.auto).toBeUndefined()
    expect(consentStorageHelper.readConsent()?.auto).toBeUndefined()
  })

  test('an application locator decides without Cloudflare', async () => {
    consentPluginHelper.registerConsentPlugin({ alias: 'app-geo', locate: async () => ({ country: 'JP' }) })
    const store = makeConsentStore()
    store.init({ silent: true, geo: {} })
    await store.settled()

    expect(store.get().record?.auto).toBeNumber()
    expect(env.calls.length).toBe(0)
  })
})

describe('the head scripts and an automatic decision', () => {
  const run = (script: string) => {
    // eslint-disable-next-line no-new-func
    new Function(script)()
  }
  const updates = (): Record<string, string>[] => ((globalThis as any).dataLayer ?? [])
    .filter((entry: IArguments) => entry[0] === 'consent' && entry[1] === 'update')
    .map((entry: IArguments) => entry[2])

  test('the bootstrap applies a fresh automatic decision and skips a stale one', () => {
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() })
    run(consentModeHelper.consentBootstrapScript())
    expect(updates()[0]?.analytics_storage).toBe('granted')

    delete (globalThis as any).dataLayer
    delete (globalThis as any).cookieConsentSetup
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() - CONSENT_AUTO_MAX_AGE - 1 })
    run(consentModeHelper.consentBootstrapScript())
    expect(updates()).toEqual([])
  })

  test('the gate loads for a fresh automatic grant and waits on a stale one', () => {
    ;(globalThis as any).__loaded = 0
    const listeners: (() => void)[] = []
    const add = (globalThis as any).addEventListener
    ;(globalThis as any).addEventListener = (_type: string, cb: () => void) => { listeners.push(cb) }
    try {
      consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() })
      run(consentModeHelper.consentGateScript('window.__loaded++'))
      expect((globalThis as any).__loaded).toBe(1)

      consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() - CONSENT_AUTO_MAX_AGE - 1 })
      run(consentModeHelper.consentGateScript('window.__loaded++'))
      expect((globalThis as any).__loaded).toBe(1)
      expect(listeners.length).toBe(1)
    } finally {
      ;(globalThis as any).addEventListener = add
      delete (globalThis as any).__loaded
    }
  })
})

describe('the linker and an automatic decision', () => {
  const DOMAINS = ['site.test', 'platform.test']

  test('an automatic decision never travels as the visitor\'s own', () => {
    const record: ConsentRecord = { ...consentGeoHelper.automaticRecord() }
    const decoded = consentLinkHelper.decodeConsentLink(consentLinkHelper.encodeConsentLink(record))

    expect(decoded?.c).toEqual({})
    expect(consentLinkHelper.consentLinker().decorate?.(new URL('https://platform.test/'), record, { linker: { domains: DOMAINS } })).toBeNull()
  })

  test('the store adopts an explicit decision carried in over an automatic one', () => {
    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() })
    const incoming = { [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false }
    env.goto(`https://site.test/?owlcc=${consentLinkHelper.encodeConsentLink(incoming)}`, 'https://platform.test/')
    const store = makeConsentStore()
    store.init({ silent: true, linker: { domains: DOMAINS }, geo: { cloudflare: true } })

    expect(store.get().record).toMatchObject({ [CONSENT_ANALYTICS]: false, [CONSENT_ESSENTIAL]: true })
    expect(consentStorageHelper.readConsent()?.auto).toBeUndefined()
    expect(env.calls.length).toBe(0)
  })

  test('the inline fragment adopts over an automatic decision, never over an explicit one', () => {
    const incoming = { [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false }
    const script = consentLinkHelper.consentLinkerScript({ linker: { domains: DOMAINS } })

    consentStorageHelper.writeConsent({ ...consentGeoHelper.automaticRecord(), auto: nowSeconds() })
    env.goto(`https://site.test/?owlcc=${consentLinkHelper.encodeConsentLink(incoming)}`, 'https://platform.test/')
    // eslint-disable-next-line no-new-func
    new Function(script)()
    expect(JSON.parse(env.store.get(CONSENT_KEY) ?? '{}')).toMatchObject({ [CONSENT_ANALYTICS]: false })
    expect(JSON.parse(env.store.get(CONSENT_KEY) ?? '{}').auto).toBeUndefined()

    consentStorageHelper.writeConsent({ [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
    env.goto(`https://site.test/?owlcc=${consentLinkHelper.encodeConsentLink(incoming)}`, 'https://platform.test/')
    // eslint-disable-next-line no-new-func
    new Function(script)()
    expect(JSON.parse(env.store.get(CONSENT_KEY) ?? '{}')).toMatchObject({ [CONSENT_ANALYTICS]: true })
  })
})

describe('storage', () => {
  test('clearing removes the cookie written under a cookie domain', () => {
    consentStorageHelper.writeConsent({ [CONSENT_ANALYTICS]: true }, { cookieDomain: 'site.test' })
    env.store.clear()
    consentStorageHelper.clearConsent({ cookieDomain: 'site.test' })

    expect(consentStorageHelper.readConsent()).toBeNull()
  })
})
