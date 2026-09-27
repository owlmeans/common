import { describe, expect, test } from 'bun:test'
import { beforeEach } from 'bun:test'
import { preferredLanguageOf, resolveInitialLanguage, setLanguage } from '../src/utils/instance.js'

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

describe('the interface language is strictly necessary — always stored, always read', () => {
  const store = new Map<string, string>()
  const config = { i18n: { supportedLngs: SUPPORTED, fallbackLng: 'en' } } as never

  beforeEach(() => {
    store.clear()
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
  })

  test('an explicit choice is written at once, whatever cookie decision the visitor made', async () => {
    await setLanguage('pl')

    expect(store.get('owlmeans-lng')).toBe('pl')
  })

  test('the latest choice is the one that is stored', async () => {
    await setLanguage('pl')
    await setLanguage('de')

    expect(store.get('owlmeans-lng')).toBe('de')
  })

  test('a stored language is what the next visit starts in', async () => {
    await setLanguage('es')

    expect(resolveInitialLanguage(config)).toBe('es')
  })

  test('a stored language the application no longer supports is ignored', () => {
    store.set('owlmeans-lng', 'ja')

    expect(resolveInitialLanguage(config)).not.toBe('ja')
  })

  test('storage that refuses the write is not an error', async () => {
    ;(globalThis as any).localStorage.setItem = () => { throw new Error('blocked') }

    await setLanguage('fr')

    expect(store.has('owlmeans-lng')).toBe(false)
  })
})
