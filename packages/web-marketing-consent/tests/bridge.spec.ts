import { beforeEach, describe, expect, test } from 'bun:test'
import { CONSENT_ANALYTICS, CONSENT_MARKETING, consentStore } from '@owlmeans/consent'
import { STANDARD_MARKETING_CONSENTS } from '@owlmeans/marketing-consent'
import { cookieConsentBridge } from '../src/bridge.js'

/** A minimal browser: just the two stores `@owlmeans/consent`'s storage writes to — the same
 * fixture `@owlmeans/consent`'s own test suite uses. */
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

  return { reset: () => { store.clear(); cookie = '' } }
}

const env = browser()

// Only the two standard keys that actually carry a `cookieCategory`.
const defs = STANDARD_MARKETING_CONSENTS.filter(definition => definition.cookieCategory != null)

beforeEach(() => {
  env.reset()
  // Fresh `record`/`open`/`reason` state for the shared singleton, without pushing to a
  // (nonexistent, in this fixture) `dataLayer`.
  consentStore.init({ silent: true })
})

describe('cookieConsentBridge', () => {
  test('read returns null when nothing is stored yet', () => {
    const bridge = cookieConsentBridge()

    expect(bridge.read(defs)).toBeNull()
  })

  test('read returns the right booleans once a record exists, for cookie-bound keys only', () => {
    consentStore.save({ essential: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: false })
    const bridge = cookieConsentBridge()

    expect(bridge.read(defs)).toEqual({
      'trackers.analytics': true,
      'trackers.advertising': false,
    })
    // A definition with no `cookieCategory` is never in the result at all.
    expect(bridge.read(STANDARD_MARKETING_CONSENTS)).toEqual({
      'trackers.analytics': true,
      'trackers.advertising': false,
    })
  })

  test('write round-trips through consentStore, preserving the rest of the record and essential', () => {
    consentStore.save({ essential: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    const bridge = cookieConsentBridge()

    bridge.write({ 'trackers.analytics': true, 'trackers.advertising': true }, defs)

    const record = consentStore.get().record
    expect(record?.[CONSENT_ANALYTICS]).toBe(true)
    expect(record?.[CONSENT_MARKETING]).toBe(true)
    expect(record?.essential).toBe(true)
  })

  test('write is a no-op when nothing in defs is cookie-bound (or decided)', () => {
    consentStore.save({ essential: true, [CONSENT_ANALYTICS]: true })
    const bridge = cookieConsentBridge()

    bridge.write({ 'marketing.email': true }, STANDARD_MARKETING_CONSENTS.filter(d => d.cookieCategory == null))

    expect(consentStore.get().record?.[CONSENT_ANALYTICS]).toBe(true)
  })

  test('the re-entrancy guard stops a write from re-triggering itself via subscribe', () => {
    consentStore.save({ essential: true, [CONSENT_ANALYTICS]: false, [CONSENT_MARKETING]: false })
    const bridge = cookieConsentBridge()

    let calls = 0
    const unsubscribe = bridge.subscribe!(() => { calls++ }, defs)

    // A write made THROUGH the bridge must not deliver an update back to its own subscriber.
    bridge.write({ 'trackers.analytics': true }, defs)
    expect(calls).toBe(0)

    // A change made OUTSIDE the bridge (the cookie dialog itself, say) still reaches it.
    consentStore.save({ essential: true, [CONSENT_ANALYTICS]: true, [CONSENT_MARKETING]: true })
    expect(calls).toBe(1)

    unsubscribe()
  })
})
