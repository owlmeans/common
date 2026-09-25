import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { persistLanguage, setLanguage, setLanguagePersistence } from '@owlmeans/client-i18n'
import { CONSENT_EVENT, CONSENT_KEY, CONSENT_LANGUAGE_EVENT } from '@owlmeans/web-consent'
import { installConsentLanguage } from '../src/consent/language.js'

/** A window that is just an event bus, and a localStorage that is a map: enough for the binding. */
const env = () => {
  const store = new Map<string, string>()
  const listeners = new Map<string, Set<(e: any) => void>>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as any).window = {
    addEventListener: (t: string, f: any) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f) },
    removeEventListener: (t: string, f: any) => { listeners.get(t)?.delete(f) },
    dispatchEvent: (e: any) => { listeners.get(e.type)?.forEach(f => f(e)) },
  }
  ;(globalThis as any).CustomEvent = class { constructor(public type: string, public init: any) {} get detail() { return this.init?.detail } }

  return { store, listeners, emit: (type: string, detail?: unknown) => (globalThis as any).window.dispatchEvent(new (globalThis as any).CustomEvent(type, { detail })) }
}

describe('installConsentLanguage', () => {
  let e: ReturnType<typeof env>
  let off: () => void
  const record = (functional: boolean) => e.store.set(CONSENT_KEY, JSON.stringify({ v: 2, essential: true, functional, analytics: false, marketing: false }))

  beforeEach(() => { e = env(); off = installConsentLanguage() })
  afterEach(() => { off(); setLanguagePersistence(null); delete (globalThis as any).window })

  test('the switcher\'s choice is not remembered without a functional grant', async () => {
    await setLanguage('pl')

    expect(e.store.has('owlmeans-lng')).toBe(false)
  })

  test('…and is written when the visitor grants functional, on the consent event', async () => {
    await setLanguage('pl')
    record(true)
    e.emit(CONSENT_EVENT, { record: {} })

    expect(e.store.get('owlmeans-lng')).toBe('pl')
  })

  test('a refusal writes nothing on the consent event', async () => {
    await setLanguage('pl')
    record(false)
    e.emit(CONSENT_EVENT, { record: {} })

    expect(e.store.has('owlmeans-lng')).toBe(false)
  })

  test('a language that was waiting for the grant is applied and stored when it arrives', async () => {
    record(true)
    e.emit(CONSENT_LANGUAGE_EVENT, { language: 'de' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(e.store.get('owlmeans-lng')).toBe('de')
  })

  test('what the person picked in this page life outranks the language the link carried', async () => {
    await setLanguage('fr')
    record(true)
    e.emit(CONSENT_EVENT, { record: {} })
    e.emit(CONSENT_LANGUAGE_EVENT, { language: 'de' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(e.store.get('owlmeans-lng')).toBe('fr')
  })

  test('the returned function removes the listeners and the guard', async () => {
    off()
    expect(e.listeners.get(CONSENT_EVENT)?.size ?? 0).toBe(0)
    expect(e.listeners.get(CONSENT_LANGUAGE_EVENT)?.size ?? 0).toBe(0)

    await setLanguage('es')
    expect(e.store.get('owlmeans-lng')).toBe('es')
    expect(persistLanguage()).toBe(false)
  })
})
