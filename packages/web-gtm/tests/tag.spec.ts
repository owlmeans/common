import { describe, expect, test } from 'bun:test'
import {
  CONSENT_EVENT, CONSENT_KEY, DEFAULT_CONSENT_CATEGORIES, consentBootstrapScript,
} from '@owlmeans/consent'
import type { ConsentCategory } from '@owlmeans/consent'
import {
  GOOGLE_TAG_CSP_SOURCES, GOOGLE_TAG_FRAME_SOURCES, googleTagHeadScript, googleTagKind,
  googleTagServices, isGoogleTagId,
} from '../src/index.js'

/**
 * The publisher's filter for slot-supplied CSP sources (`CSP_SOURCE_SHAPE` in viable's
 * `sources/publisher/src/helpers/serve.ts`), copied because that is the gate these constants have
 * to pass: an entry it rejects is silently dropped from the header, and the tag it was for is
 * blocked with nothing in the page saying why.
 */
const CSP_SOURCE_SHAPE =
  /^(?:https:\/\/|wss:\/\/)?(?:\*\.)?[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~%+&=@:/-]*)?$/

interface Element { id?: string, src?: string, async?: boolean }

/**
 * Run an emitted snippet the way a browser runs an inline head script, against a window and a
 * document that record what it did. The snippet is executed rather than pattern-matched because
 * what matters is the ORDER in which things reach the queue, and the text only suggests it.
 */
const browser = (stored?: { key?: string, record: Record<string, unknown> }) => {
  const storage = new Map<string, string>()
  if (stored != null) {
    storage.set(stored.key ?? CONSENT_KEY, JSON.stringify(stored.record))
  }
  const loaded: Element[] = []
  const byId = new Map<string, Element>()
  const attach = (element: Element) => {
    loaded.push(element)
    if (element.id != null) byId.set(element.id, element)
  }
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const win: Record<string, unknown> & {
    addEventListener: (type: string, cb: (event: unknown) => void) => void
    removeEventListener: (type: string, cb: (event: unknown) => void) => void
  } = {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    addEventListener: (type, cb) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb])
    },
    removeEventListener: (type, cb) => {
      listeners.set(type, (listeners.get(type) ?? []).filter(listener => listener !== cb))
    },
  }
  const doc = {
    cookie: '',
    createElement: (): Element => ({}),
    getElementById: (id: string) => byId.get(id) ?? null,
    getElementsByTagName: () => [{ parentNode: { insertBefore: attach } }],
    head: { appendChild: attach },
  }

  return {
    win,
    loaded,
    run: (script: string) => {
      // eslint-disable-next-line no-new-func
      new Function('window', 'document', script)(win, doc)
    },
    /** Fire a `CONSENT_EVENT` the way `applyConsent` does, for the gated ("basic" mode) loader. */
    grant: (record: Record<string, unknown>) => {
      for (const cb of listeners.get(CONSENT_EVENT) ?? []) {
        cb({ detail: { record } })
      }
    },
    listenerCount: (type = CONSENT_EVENT) => listeners.get(type)?.length ?? 0,
    /** The queue as `command:arg` strings; gtm.js's own object entry shows as `event:gtm.js`. */
    queue: (name = 'dataLayer'): string[] =>
      ((win[name] as unknown[] | undefined) ?? []).map(entry => {
        const item = entry as { length?: number, event?: string }
        if (typeof item.length === 'number') {
          const args = Array.from(entry as ArrayLike<unknown>)

          return args.slice(0, 2).map(arg => typeof arg === 'object' ? 'obj' : String(arg)).join(':')
        }

        return `event:${String(item.event)}`
      }),
  }
}

describe('isGoogleTagId / googleTagKind', () => {
  const cases: [string, 'gtm' | 'gtag' | null][] = [
    ['GTM-ABC1234', 'gtm'],
    ['GTM-ABCD', 'gtm'],
    ['GTM-ABCDEFGHIJKL', 'gtm'],
    ['G-ABCDEF1234', 'gtag'],
    ['GT-ABCD1234', 'gtag'],
    ['AW-123456789', 'gtag'],
    ['DC-1234567', 'gtag'],
    ['G-ABCDEFGHIJKLMNOP', 'gtag'],
    // Everything below must load nothing.
    ['', null],
    ['gtm-abc1234', null],
    ['g-abcdef1234', null],
    ['GTM-ABC', null],
    ['GTM-ABCDEFGHIJKLM', null],
    ['G-ABCDEFGHIJKLMNOPQ', null],
    ['G-', null],
    ['UA-12345678-1', null],
    ['G-ABCD 1234', null],
    [' G-ABCD1234', null],
    ['G-ABCD1234\n', null],
    ['G-ABCD1234"+alert(1)+"', null],
    ['G-ABCD</script>', null],
    ['GTM-ABCD1234&l=x', null],
  ]

  for (const [id, kind] of cases) {
    test(`${JSON.stringify(id)} → ${String(kind)}`, () => {
      expect(isGoogleTagId(id)).toBe(kind != null)
      expect(googleTagKind(id)).toBe(kind)
    })
  }

  test('a value that is not a string is not an id', () => {
    expect(isGoogleTagId(undefined as never)).toBe(false)
    expect(googleTagKind(null as never)).toBeNull()
  })
})

describe('googleTagHeadScript — the order ("advanced" mode — the original, unconditional load)', () => {
  test('gtag.js: consent default, then redaction, then js/config, then the library', () => {
    const script = googleTagHeadScript({ id: 'G-ABCD1234', mode: 'advanced' })
    const page = browser()
    page.run(script)

    // What the tag obeys is what is on the queue when it loads, so the default has to be FIRST —
    // not merely present.
    expect(page.queue()).toEqual([
      'consent:default',
      'set:ads_data_redaction',
      'set:url_passthrough',
      'js:obj',
      'config:G-ABCD1234',
    ])
    expect(page.loaded.map(element => element.src)).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-ABCD1234',
    ])
    expect(page.loaded[0].async).toBe(true)
    // And in the text too: the library is requested after the default is declared.
    expect(script.indexOf("'consent','default'")).toBeLessThan(script.indexOf('gtag/js'))
  })

  test('the redaction flags carry the right values', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'AW-123456789', mode: 'advanced' }))
    const sets = ((page.win.dataLayer as ArrayLike<unknown>[]) ?? [])
      .map(entry => Array.from(entry))
      .filter(args => args[0] === 'set')

    expect(sets).toEqual([['set', 'ads_data_redaction', true], ['set', 'url_passthrough', false]])
  })

  test('Tag Manager: consent default, then redaction, then the container', () => {
    const script = googleTagHeadScript({ id: 'GTM-ABC1234', mode: 'advanced' })
    const page = browser()
    page.run(script)

    expect(page.queue()).toEqual([
      'consent:default',
      'set:ads_data_redaction',
      'set:url_passthrough',
      'event:gtm.js',
    ])
    expect(page.loaded.map(element => element.src)).toEqual([
      'https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234',
    ])
    expect(script.indexOf("'consent','default'")).toBeLessThan(script.indexOf('gtm.js'))
  })

  test('a returning visitor\'s decision is applied before the tag is configured', () => {
    const page = browser({ record: { essential: true, analytics: true, marketing: false, v: 2 } })
    page.run(googleTagHeadScript({ id: 'G-ABCD1234' }))
    const queue = page.queue()

    expect(queue.slice(0, 2)).toEqual(['consent:default', 'consent:update'])
    expect(queue.indexOf('consent:update')).toBeLessThan(queue.indexOf('config:G-ABCD1234'))
    expect(page.win.owlConsentAnalytics).toBe(true)
    expect(page.win.owlConsentMarketing).toBe(false)
  })

  test('running it twice configures the tag once', () => {
    // Two stampings or a hot reload must not double-count every page view.
    const page = browser()
    const script = googleTagHeadScript({ id: 'G-ABCD1234', mode: 'advanced' })
    page.run(script)
    page.run(script)

    expect(page.queue().filter(entry => entry.startsWith('config:'))).toHaveLength(1)
    expect(page.queue().filter(entry => entry === 'consent:default')).toHaveLength(1)
    expect(page.loaded).toHaveLength(1)
  })

  test('window.gtag is published for application events, and never replaced', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'G-ABCD1234', mode: 'advanced' }))
    expect(typeof page.win.gtag).toBe('function')

    const owned = () => undefined
    const other = browser()
    other.win.gtag = owned
    other.run(googleTagHeadScript({ id: 'G-ABCD1234', mode: 'advanced' }))
    expect(other.win.gtag).toBe(owned)
  })

  test('a custom queue is used by the tag and passed to the library', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'G-ABCD1234', dataLayerName: 'owlLayer', mode: 'advanced' }))

    expect(page.queue('owlLayer')).toContain('config:G-ABCD1234')
    expect(page.loaded[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABCD1234&l=owlLayer')
  })

  test('a queue name that is not an identifier falls back to dataLayer', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'G-ABCD1234', dataLayerName: 'a-b', mode: 'advanced' }))

    expect(page.queue()).toContain('config:G-ABCD1234')
    expect(page.loaded[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABCD1234')
  })
})

describe('googleTagHeadScript — "basic" mode (the default)', () => {
  test('an invalid id still yields only the bootstrap, regardless of mode', () => {
    // A mistyped tag must never cost the page its consent defaults — in either mode, since an id
    // this invalid never reaches the gate at all.
    for (const id of ['', 'UA-1234-1', 'G-x"+alert(1)']) {
      for (const mode of ['basic', 'advanced'] as const) {
        const script = googleTagHeadScript({ id, mode })

        expect(script).toBe(consentBootstrapScript({ id } as never))
        expect(script).not.toContain('googletagmanager')
        expect(script).not.toContain('ads_data_redaction')
      }
    }
    // And omitting `mode` altogether is the same as the default, `'basic'`.
    expect(googleTagHeadScript({ id: '' })).toBe(googleTagHeadScript({ id: '', mode: 'basic' }))
  })

  test('a valid id with no stored consent does not load the tag synchronously', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'G-ABCD1234' }))

    // The consent bootstrap and the redaction flags still run unconditionally — Consent Mode's
    // OWN denied-by-default signals are declared either way — but nothing asked for the tag itself.
    expect(page.queue()).toEqual(['consent:default', 'set:ads_data_redaction', 'set:url_passthrough'])
    expect(page.loaded).toHaveLength(0)
    expect(page.listenerCount()).toBe(1)
  })

  test('it loads once the visitor grants a signal-bearing category, and not before', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'G-ABCD1234' }))

    // Denying, or granting only a category with no Consent Mode signal, changes nothing.
    page.grant({ essential: true, analytics: false, marketing: false })
    expect(page.loaded).toHaveLength(0)

    page.grant({ essential: true, analytics: true, marketing: false })
    expect(page.loaded).toHaveLength(1)
    expect(page.queue().filter(entry => entry.startsWith('config:'))).toEqual(['config:G-ABCD1234'])
    expect(page.listenerCount()).toBe(0)

    // A later grant does nothing further — the listener already removed itself, and the loader's
    // own anti-double-load guard would refuse a second run in any case.
    page.grant({ essential: true, analytics: true, marketing: true })
    expect(page.loaded).toHaveLength(1)
  })

  test('a returning visitor with a stored grant loads immediately, with no listener left behind', () => {
    const page = browser({ record: { essential: true, analytics: true, marketing: false, v: 2 } })
    page.run(googleTagHeadScript({ id: 'G-ABCD1234' }))

    expect(page.loaded).toHaveLength(1)
    expect(page.queue().filter(entry => entry.startsWith('config:'))).toEqual(['config:G-ABCD1234'])
    expect(page.listenerCount()).toBe(0)
  })

  test('the Tag Manager container is gated the same way', () => {
    const page = browser()
    page.run(googleTagHeadScript({ id: 'GTM-ABC1234' }))

    expect(page.loaded).toHaveLength(0)

    page.grant({ essential: true, marketing: true })
    expect(page.loaded).toHaveLength(1)
    expect(page.loaded[0].src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234')
  })
})

describe('googleTagHeadScript — safe inline in HTML', () => {
  const hostile: ConsentCategory[] = [
    ...DEFAULT_CONSENT_CATEGORIES,
    {
      key: 'x</script><!--y', labelKey: 'x', descriptionKey: 'x',
      globalVar: 'probe', signals: ['personalization_storage'],
    },
  ]

  test('no configured value can close the script element or open a comment', () => {
    const script = googleTagHeadScript({
      id: 'G-ABCD1234', categories: hostile, storageKey: 'k</SCRIPT>',
      dataLayerName: '</script><script>alert(1)</script>',
    })

    expect(script.toLowerCase()).not.toContain('</script')
    expect(script).not.toContain('<!--')
  })

  test('the escaped script still means what it said', () => {
    // The backslashes are for the HTML parser; JavaScript must read the same values as before.
    const key = 'k</script>'
    const page = browser({ key, record: { 'x</script><!--y': true, v: 2 } })
    page.run(googleTagHeadScript({ id: 'G-ABCD1234', categories: hostile, storageKey: key }))

    expect(page.win.probe).toBe(true)
    expect(page.queue()).toContain('consent:update')
    expect(page.queue()).toContain('config:G-ABCD1234')
  })
})

describe('GOOGLE_TAG_CSP_SOURCES / GOOGLE_TAG_FRAME_SOURCES', () => {
  test('every entry passes the publisher\'s source filter, within its cap', () => {
    for (const source of [...GOOGLE_TAG_CSP_SOURCES, ...GOOGLE_TAG_FRAME_SOURCES]) {
      expect({ source, ok: CSP_SOURCE_SHAPE.test(source) }).toEqual({ source, ok: true })
      expect(source.startsWith('https://')).toBe(true)
    }
    expect(GOOGLE_TAG_CSP_SOURCES.length).toBeLessThanOrEqual(10)
    expect(new Set(GOOGLE_TAG_CSP_SOURCES).size).toBe(GOOGLE_TAG_CSP_SOURCES.length)
  })

  test('they cover Tag Manager, GA4 and Google Ads', () => {
    // A host a CSP wildcard covers (`https://*.x.com` admits `www.x.com`, not `x.com`) counts.
    const covered = (host: string) => GOOGLE_TAG_CSP_SOURCES.some(source => {
      const pattern = source.replace('https://', '')

      return pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern
    })
    for (const host of [
      'www.googletagmanager.com', 'region1.google-analytics.com', 'region1.analytics.google.com',
      'stats.g.doubleclick.net', 'googleads.g.doubleclick.net', 'ad.doubleclick.net',
      'www.googleadservices.com', 'pagead2.googlesyndication.com', 'www.google.com',
    ]) {
      expect({ host, covered: covered(host) }).toEqual({ host, covered: true })
    }
    expect(GOOGLE_TAG_FRAME_SOURCES).toEqual([
      'https://www.googletagmanager.com', 'https://td.doubleclick.net',
    ])
  })

  test('they cannot be mutated by a consumer', () => {
    expect(Object.isFrozen(GOOGLE_TAG_CSP_SOURCES)).toBe(true)
    expect(Object.isFrozen(GOOGLE_TAG_FRAME_SOURCES)).toBe(true)
  })
})

describe('googleTagServices', () => {
  const categoryKeys = new Set(DEFAULT_CONSENT_CATEGORIES.map(category => category.key))

  test('GA4 is analytics, with the session cookie named after the measurement id', () => {
    const services = googleTagServices('G-ABCD1234')

    expect(services).toHaveLength(1)
    expect(services[0]).toMatchObject({ name: 'Google Analytics', category: 'analytics' })
    expect(services[0].cookies).toEqual(['_ga', '_ga_ABCD1234'])
  })

  test('Google Ads and Floodlight are marketing', () => {
    expect(googleTagServices('AW-123456789').map(service => service.category)).toEqual(['marketing'])
    expect(googleTagServices('AW-123456789')[0].cookies).toContain('_gcl_au')
    expect(googleTagServices('DC-1234567').map(service => service.category)).toEqual(['marketing'])
    expect(googleTagServices('DC-1234567')[0].cookies).toContain('_gcl_dc')
  })

  test('a container or a Google tag discloses both, as configured there', () => {
    // Whatever the owner put in the container can run, so the policy may not claim less.
    for (const id of ['GTM-ABC1234', 'GT-ABCD1234']) {
      const services = googleTagServices(id)

      expect(services.map(service => service.category)).toEqual(['analytics', 'marketing'])
      expect(services.every(service => /configured/.test(service.purpose ?? ''))).toBe(true)
    }
  })

  test('every entry is complete and lands in a default category', () => {
    for (const id of ['G-ABCD1234', 'GT-ABCD1234', 'AW-123456789', 'DC-1234567', 'GTM-ABC1234']) {
      for (const service of googleTagServices(id)) {
        expect(service.provider).toBe('Google LLC')
        expect(service.privacyHref).toStartWith('https://policies.google.com/')
        expect(categoryKeys.has(service.category)).toBe(true)
        expect(service.cookies?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })

  test('an invalid id discloses nothing, as it loads nothing', () => {
    expect(googleTagServices('')).toEqual([])
    expect(googleTagServices('UA-1234-1')).toEqual([])
  })
})
