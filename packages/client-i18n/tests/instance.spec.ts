import { describe, expect, test } from 'bun:test'
import { afterEach, beforeEach } from 'bun:test'
import {
  persistLanguage, preferredLanguageOf, resolveInitialLanguage, setLanguage, setLanguagePersistence,
} from '../src/utils/instance.js'

const SUPPORTED = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']

describe('preferredLanguageOf — the first-visit language', () => {
  test('a regional tag resolves to its supported base language', () => {
    expect(preferredLanguageOf(SUPPORTED, ['de-DE'])).toBe('de')
    expect(preferredLanguageOf(SUPPORTED, ['fr-FR', 'en'])).toBe('fr')
    expect(preferredLanguageOf(SUPPORTED, ['pl_PL'])).toBe('pl')
  })

  test('the browser order decides, and an unsupported language is skipped', () => {
    expect(preferredLanguageOf(SUPPORTED, ['it-IT', 'de-CH', 'en-US'])).toBe('de')
    expect(preferredLanguageOf(SUPPORTED, ['EN-us'])).toBe('en')
  })

  test('an exact supported tag wins over its base', () => {
    expect(preferredLanguageOf(['pt', 'pt-BR'], ['pt-BR'])).toBe('pt-BR')
  })

  test('nothing supported, or nothing known — null (the caller falls back)', () => {
    expect(preferredLanguageOf(SUPPORTED, ['it-IT', 'ja'])).toBeNull()
    expect(preferredLanguageOf(SUPPORTED, [])).toBeNull()
    expect(preferredLanguageOf(SUPPORTED, [null, undefined, ''])).toBeNull()
  })
})

describe('language persistence guard — a choice is remembered only while storage is allowed', () => {
  const store = new Map<string, string>()
  const config = { i18n: { supportedLngs: SUPPORTED, fallbackLng: 'en' } } as never
  let allowed = false

  beforeEach(() => {
    store.clear()
    allowed = false
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
    setLanguagePersistence(() => allowed)
  })
  afterEach(() => { setLanguagePersistence(null) })

  test('with the guard saying no, an explicit choice is not written', async () => {
    await setLanguage('pl')

    expect(store.has('owlmeans-lng')).toBe(false)
  })

  test('the refused choice is written the moment storage is allowed', async () => {
    await setLanguage('pl')
    expect(persistLanguage()).toBe(false)

    allowed = true

    expect(persistLanguage()).toBe(true)
    expect(store.get('owlmeans-lng')).toBe('pl')
    expect(persistLanguage()).toBe(false)
  })

  test('the latest refused choice is the one that is written', async () => {
    await setLanguage('pl')
    await setLanguage('de')
    allowed = true
    persistLanguage()

    expect(store.get('owlmeans-lng')).toBe('de')
  })

  test('with the guard saying yes, a choice is written at once, as before', async () => {
    allowed = true
    await setLanguage('fr')

    expect(store.get('owlmeans-lng')).toBe('fr')
  })

  test('a stored language counts as absent while the guard says no, and is used once it says yes', () => {
    store.set('owlmeans-lng', 'de')

    expect(resolveInitialLanguage(config)).not.toBe('de')

    allowed = true
    expect(resolveInitialLanguage(config)).toBe('de')
  })

  test('with no guard installed nothing changes: choices are written and read', async () => {
    setLanguagePersistence(null)
    await setLanguage('es')

    expect(store.get('owlmeans-lng')).toBe('es')
    expect(resolveInitialLanguage(config)).toBe('es')
  })
})
