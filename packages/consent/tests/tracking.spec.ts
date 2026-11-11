import { describe, test, expect } from 'bun:test'
import {
  CONSENT_ANALYTICS, CONSENT_ESSENTIAL, CONSENT_EVENT, CONSENT_KEY, CONSENT_MARKETING, DEFAULT_CONSENT_CATEGORIES,
} from '../src/consts.js'
import { consentModeHelper, consentTrackingHelper } from '../src/tracking.js'
import type { ConsentCategory, ConsentRecord } from '../src/types.js'

describe('trackingGranted', () => {
  test('no record at all is not granted', () => {
    expect(consentTrackingHelper.trackingGranted(null)).toBe(false)
  })

  test('an essential-only record is not granted — required categories never count', () => {
    const record: ConsentRecord = {
      [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false,
    }

    expect(consentTrackingHelper.trackingGranted(record)).toBe(false)
  })

  test('analytics granted is tracking-granted', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true }

    expect(consentTrackingHelper.trackingGranted(record)).toBe(true)
  })

  test('marketing granted is tracking-granted too', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_MARKETING]: true }

    expect(consentTrackingHelper.trackingGranted(record)).toBe(true)
  })

  test('a required category is ignored even when it is marked tracking and the record grants it', () => {
    // Required must veto it, because everyone gets it regardless of what the record says.
    const categories: ConsentCategory[] = [
      { key: 'essential', required: true, labelKey: 'a', descriptionKey: 'b', tracking: true },
    ]

    expect(consentTrackingHelper.trackingGranted({ essential: true }, categories)).toBe(false)
  })

  test('a category not marked tracking is ignored even when granted', () => {
    const categories: ConsentCategory[] = [
      { key: 'preferences', labelKey: 'a', descriptionKey: 'b' },
    ]

    expect(consentTrackingHelper.trackingGranted({ preferences: true }, categories)).toBe(false)
  })

  test('the default analytics and marketing categories are the tracking ones', () => {
    expect(DEFAULT_CONSENT_CATEGORIES.filter(category => category.tracking === true).map(category => category.key))
      .toEqual([CONSENT_ANALYTICS, CONSENT_MARKETING])
  })
})

describe('consentGateScript — the two reachable paths', () => {
  /** A minimal window/document the generated script can run against, with an event bus. */
  const makeBrowser = (stored?: { key?: string, record: Record<string, unknown> }) => {
    const storage = new Map<string, string>()
    if (stored != null) {
      storage.set(stored.key ?? CONSENT_KEY, JSON.stringify(stored.record))
    }
    const listeners = new Map<string, ((event: unknown) => void)[]>()
    const win: Record<string, unknown> & {
      addEventListener: (type: string, cb: (event: unknown) => void) => void
      removeEventListener: (type: string, cb: (event: unknown) => void) => void
    } = {
      localStorage: { getItem: (k: string) => storage.get(k) ?? null },
      addEventListener: (type, cb) => {
        listeners.set(type, [...(listeners.get(type) ?? []), cb])
      },
      removeEventListener: (type, cb) => {
        listeners.set(type, (listeners.get(type) ?? []).filter(listener => listener !== cb))
      },
    }
    const doc = { cookie: '' }

    return {
      win,
      run: (script: string) => {
        // eslint-disable-next-line no-new-func
        new Function('window', 'document', script)(win, doc)
      },
      dispatch: (detail: unknown) => {
        for (const cb of listeners.get(CONSENT_EVENT) ?? []) {
          cb({ detail })
        }
      },
      listenerCount: () => listeners.get(CONSENT_EVENT)?.length ?? 0,
    }
  }

  test('a returning visitor with a stored grant runs the loader immediately, synchronously', () => {
    const browser = makeBrowser({ record: { essential: true, analytics: true, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

    expect(browser.win.__loaded).toBe(1)
    // Nothing left listening — the immediate branch never subscribes.
    expect(browser.listenerCount()).toBe(0)
  })

  test('a stored record that grants nothing does not run the loader immediately', () => {
    const browser = makeBrowser({ record: { essential: true, analytics: false, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

    expect(browser.win.__loaded).toBe(0)
    expect(browser.listenerCount()).toBe(1)
  })

  test('no stored record at all falls to the event-listener branch and waits', () => {
    const browser = makeBrowser()
    browser.win.__loaded = 0
    browser.run(consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

    expect(browser.win.__loaded).toBe(0)

    // A denying event changes nothing.
    browser.dispatch({ record: { essential: true, analytics: false } })
    expect(browser.win.__loaded).toBe(0)

    // The first granting event runs the loader and removes the listener.
    browser.dispatch({ record: { essential: true, analytics: true } })
    expect(browser.win.__loaded).toBe(1)
    expect(browser.listenerCount()).toBe(0)

    // A later event does nothing further — the listener already removed itself.
    browser.dispatch({ record: { essential: true, analytics: true } })
    expect(browser.win.__loaded).toBe(1)
  })

  test('the cookie answers when localStorage has nothing stored', () => {
    // Same fallback order `storageReadScript`/`readConsent` use: localStorage first, the
    // cookie second. Simulated here by handing the script a `document` whose cookie carries the
    // record and a `window` whose localStorage is empty.
    const record = JSON.stringify({ essential: true, analytics: true, v: 2 })
    const win: Record<string, unknown> & {
      addEventListener: (type: string, cb: (event: unknown) => void) => void
      removeEventListener: (type: string, cb: (event: unknown) => void) => void
    } = {
      localStorage: { getItem: () => null },
      addEventListener: () => {},
      removeEventListener: () => {},
      __loaded: 0,
    }
    const doc = { cookie: `${CONSENT_KEY}=${record}` }
    // eslint-disable-next-line no-new-func
    new Function(
      'window', 'document', consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1')
    )(win, doc)

    expect(win.__loaded).toBe(1)
  })

  test('only a tracking, non-required category can satisfy the gate', () => {
    const categories: ConsentCategory[] = [
      { key: 'essential', required: true, labelKey: 'a', descriptionKey: 'b', tracking: true },
      { key: 'chat', labelKey: 'e', descriptionKey: 'f' },
      { key: 'analytics', labelKey: 'c', descriptionKey: 'd', tracking: true },
    ]
    const browser = makeBrowser({ record: { essential: true, analytics: false, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1', { categories }))

    expect(browser.win.__loaded).toBe(0)

    browser.dispatch({ record: { essential: true, chat: true } })
    expect(browser.win.__loaded).toBe(0)

    browser.dispatch({ record: { essential: true, analytics: true } })
    expect(browser.win.__loaded).toBe(1)
  })

  test('the generated script carries both reachable code paths in its text', () => {
    const script = consentTrackingHelper.consentGateScript('window.__loaded = (window.__loaded || 0) + 1')

    // The immediate branch: `load()` called right after the stored-record check, before any
    // listener is attached.
    expect(script.indexOf('load()')).toBeLessThan(script.indexOf('addEventListener'))
    // The event-listener branch: the same loader, reachable a second time from inside the handler
    // — plus the `function load(){...}` declaration itself, three occurrences of `load()` in all.
    expect(script.match(/load\(\)/g)?.length).toBe(3)
    expect(script).toContain(JSON.stringify(CONSENT_EVENT))
    expect(script).toContain(JSON.stringify(CONSENT_KEY))
  })

  test('a custom storage key is honoured, matching the bootstrap script\'s own lookup', () => {
    const browser = makeBrowser({ key: 'custom_key', record: { essential: true, analytics: true, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentTrackingHelper.consentGateScript(
      'window.__loaded = (window.__loaded || 0) + 1', { storageKey: 'custom_key' }
    ))

    expect(browser.win.__loaded).toBe(1)
  })
})

describe('consentGateScript — the emitted text', () => {
  test('is byte-identical to what pages already carry, for the default categories', () => {
    // Pages are served under a hash-based CSP, so the gate a tag package wraps around its loader
    // must not move by a byte for the same inputs.
    expect(consentTrackingHelper.consentGateScript('window.__loaded=1')).toBe(
      '(function(w,d){function ok(r){if(!r)return false;var cs=[{"key":"essential","required":true,"hasSignal":true},'
      + '{"key":"analytics","required":false,"hasSignal":true},{"key":"marketing","required":false,"hasSignal":true}];'
      + 'for(var i=0;i<cs.length;i++){var c=cs[i];if(!c.required&&c.hasSignal&&r[c.key]===true)return true}return false}'
      + 'function load(){window.__loaded=1}var raw=null;try{raw=w.localStorage.getItem("site_cookie_consent")}catch(e){}'
      + 'if(!raw){var p=(\'; \'+d.cookie).split(\'; \'+"site_cookie_consent"+\'=\');if(p.length===2){raw=p.pop().split(\';\').shift()}}'
      + 'var r=null;if(raw){try{r=JSON.parse(raw)}catch(e){r=null}}if(r&&typeof r.auto===\'number\'){var a=Math.floor(Date.now()/1000)-r.auto;'
      + 'if(a>3600||a<-60){r=null}}if(ok(r)){load();return}function h(ev){if(ok(ev&&ev.detail&&ev.detail.record)){'
      + 'w.removeEventListener("owlmeans:consent",h);load()}}w.addEventListener("owlmeans:consent",h)})(window,document)',
    )
  })

  test('the inline building blocks are what the gate is made of', () => {
    const gate = consentTrackingHelper.consentGateScript('x()', { storageKey: 'k' })

    expect(gate).toContain(consentTrackingHelper.storageReadScript({ storageKey: 'k' }))
    expect(gate).toContain(consentTrackingHelper.staleAutoScript('r=null'))
  })
})

describe('the deprecated consentModeHelper', () => {
  test('delegates its provider-free members to the tracking and signal helpers', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true }

    expect(consentModeHelper.trackingGranted(record)).toBe(consentTrackingHelper.trackingGranted(record))
    expect(consentModeHelper.consentBootstrapScript({ storageKey: 'k' }))
      .toBe(consentTrackingHelper.consentBootstrapScript({ storageKey: 'k' }))
    expect(consentModeHelper.consentGateScript('x()')).toBe(consentTrackingHelper.consentGateScript('x()'))
  })
})
