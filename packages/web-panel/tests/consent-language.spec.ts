import { beforeEach, describe, expect, test } from 'bun:test'
import { i18nInstanceHelper } from '@owlmeans/client-i18n'
import { installConsentLanguage } from '../src/consent/language.js'

describe('installConsentLanguage — a deprecated no-op', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
  })

  test('returns a cleanup that can be called, more than once', () => {
    const off = installConsentLanguage()

    expect(typeof off).toBe('function')
    expect(off()).toBeUndefined()
    expect(off()).toBeUndefined()
  })

  test('changes nothing about the language: a choice is stored either way, whatever the decision', async () => {
    installConsentLanguage()
    await i18nInstanceHelper.setLanguage('pl')

    expect(store.get('owlmeans-lng')).toBe('pl')
  })
})
