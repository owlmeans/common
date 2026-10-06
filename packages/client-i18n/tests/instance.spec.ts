import { describe, expect, test } from 'bun:test'
import { beforeEach } from 'bun:test'
import { i18nInstanceHelper } from '../src/utils/instance.js'

const SUPPORTED = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']

describe('preferredLanguageOf — the first-visit language', () => {
  test('a regional tag resolves to its supported base language', () => {
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['de-DE'])).toBe('de')
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['fr-FR', 'en'])).toBe('fr')
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['pl_PL'])).toBe('pl')
  })

  test('the browser order decides, and an unsupported language is skipped', () => {
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['it-IT', 'de-CH', 'en-US'])).toBe('de')
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['EN-us'])).toBe('en')
  })

  test('an exact supported tag wins over its base', () => {
    expect(i18nInstanceHelper.preferredLanguageOf(['pt', 'pt-BR'], ['pt-BR'])).toBe('pt-BR')
  })

  test('nothing supported, or nothing known — null (the caller falls back)', () => {
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, ['it-IT', 'ja'])).toBeNull()
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, [])).toBeNull()
    expect(i18nInstanceHelper.preferredLanguageOf(SUPPORTED, [null, undefined, ''])).toBeNull()
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
    await i18nInstanceHelper.setLanguage('pl')

    expect(store.get('owlmeans-lng')).toBe('pl')
  })

  test('the latest choice is the one that is stored', async () => {
    await i18nInstanceHelper.setLanguage('pl')
    await i18nInstanceHelper.setLanguage('de')

    expect(store.get('owlmeans-lng')).toBe('de')
  })

  test('a stored language is what the next visit starts in', async () => {
    await i18nInstanceHelper.setLanguage('es')

    expect(i18nInstanceHelper.resolveInitialLanguage(config)).toBe('es')
  })

  test('a stored language the application no longer supports is ignored', () => {
    store.set('owlmeans-lng', 'ja')

    expect(i18nInstanceHelper.resolveInitialLanguage(config)).not.toBe('ja')
  })

  test('storage that refuses the write is not an error', async () => {
    ;(globalThis as any).localStorage.setItem = () => { throw new Error('blocked') }

    await i18nInstanceHelper.setLanguage('fr')

    expect(store.has('owlmeans-lng')).toBe(false)
  })
})
