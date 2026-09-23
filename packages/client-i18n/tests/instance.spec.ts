import { describe, expect, test } from 'bun:test'
import { preferredLanguageOf } from '../src/utils/instance.js'

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
