import { describe, test, expect } from 'bun:test'
import { CONSENT_ANALYTICS, CONSENT_ESSENTIAL, CONSENT_EVENT, CONSENT_KEY, CONSENT_MARKETING } from '../src/consts.js'
import { consentGateScript, trackingGranted } from '../src/gtm.js'
import type { ConsentCategory, ConsentRecord } from '../src/types.js'

describe('trackingGranted', () => {
  test('no record at all is not granted', () => {
    expect(trackingGranted(null)).toBe(false)
  })

  test('an essential-only record is not granted — required categories never count', () => {
    const record: ConsentRecord = {
      [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false,
    }

    expect(trackingGranted(record)).toBe(false)
  })

  test('analytics granted is tracking-granted', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_ANALYTICS]: true }

    expect(trackingGranted(record)).toBe(true)
  })

  test('marketing granted is tracking-granted too', () => {
    const record: ConsentRecord = { [CONSENT_ESSENTIAL]: true, [CONSENT_MARKETING]: true }

    expect(trackingGranted(record)).toBe(true)
  })

  test('a required category is ignored even when the record marks it granted', () => {
    // A category can be BOTH required and signal-bearing (`essential` drives security_storage /
    // functionality_storage by default) — required must still veto it, because everyone gets it
    // regardless of what the record says.
    const categories: ConsentCategory[] = [
      {
        key: 'essential', required: true, labelKey: 'a', descriptionKey: 'b',
        signals: ['security_storage'],
      },
    ]

    expect(trackingGranted({ essential: true }, categories)).toBe(false)
  })

  test('a category with no signals is ignored even when granted', () => {
    const categories: ConsentCategory[] = [
      { key: 'preferences', labelKey: 'a', descriptionKey: 'b' },
    ]

    expect(trackingGranted({ preferences: true }, categories)).toBe(false)
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
    browser.run(consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

    expect(browser.win.__loaded).toBe(1)
    // Nothing left listening — the immediate branch never subscribes.
    expect(browser.listenerCount()).toBe(0)
  })

  test('a stored record that grants nothing does not run the loader immediately', () => {
    const browser = makeBrowser({ record: { essential: true, analytics: false, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

    expect(browser.win.__loaded).toBe(0)
    expect(browser.listenerCount()).toBe(1)
  })

  test('no stored record at all falls to the event-listener branch and waits', () => {
    const browser = makeBrowser()
    browser.win.__loaded = 0
    browser.run(consentGateScript('window.__loaded = (window.__loaded || 0) + 1'))

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
    // Same fallback order `consentBootstrapScript`/`readConsent` use: localStorage first, the
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
      'window', 'document', consentGateScript('window.__loaded = (window.__loaded || 0) + 1')
    )(win, doc)

    expect(win.__loaded).toBe(1)
  })

  test('only a signal-bearing, non-required category can satisfy the gate', () => {
    const categories: ConsentCategory[] = [
      { key: 'essential', required: true, labelKey: 'a', descriptionKey: 'b', signals: ['security_storage'] },
      { key: 'analytics', labelKey: 'c', descriptionKey: 'd', signals: ['analytics_storage'] },
    ]
    const browser = makeBrowser({ record: { essential: true, analytics: false, v: 2 } })
    browser.win.__loaded = 0
    browser.run(consentGateScript('window.__loaded = (window.__loaded || 0) + 1', { categories }))

    expect(browser.win.__loaded).toBe(0)

    browser.dispatch({ record: { essential: true, analytics: true } })
    expect(browser.win.__loaded).toBe(1)
  })

  test('the generated script carries both reachable code paths in its text', () => {
    const script = consentGateScript('window.__loaded = (window.__loaded || 0) + 1')

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
    browser.run(consentGateScript(
      'window.__loaded = (window.__loaded || 0) + 1', { storageKey: 'custom_key' }
    ))

    expect(browser.win.__loaded).toBe(1)
  })
})
