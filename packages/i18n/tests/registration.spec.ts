import { describe, expect, test, beforeEach } from 'bun:test'
import {
  addI18nLib, addI18nApp, initI18nResource,
  DEFAULT_LNG, LIB_NAMESPACE, SUPPORTED_LNGS, I18nTier
} from '@owlmeans/i18n'
import { resetStorage } from './context.js'

beforeEach(resetStorage)

describe('@owlmeans/i18n — registration', () => {
  test('addI18nLib registers under lib namespace', () => {
    addI18nLib('en', 'errors', { minLength: 'Too short' })
    const result = initI18nResource('en', 'errors', LIB_NAMESPACE)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].tier).toBe(I18nTier.Library)
    expect(result![0].ns).toBe(LIB_NAMESPACE)
    expect(result![0].data).toMatchObject({ minLength: 'Too short' })
  })

  test('addI18nApp registers under resource-name namespace', () => {
    addI18nApp('en', 'my-app', { title: 'My App' })
    const result = initI18nResource('en', 'my-app', 'my-app')
    expect(result).not.toBeNull()
    expect(result![0].tier).toBe(I18nTier.App)
    expect(result![0].ns).toBe('my-app')
  })

  test('addI18nApp accepts explicit ns override', () => {
    addI18nApp('en', 'my-app', { title: 'My App' }, { ns: 'custom-ns' })
    const result = initI18nResource('en', 'my-app', 'custom-ns')
    expect(result).not.toBeNull()
    expect(result![0].ns).toBe('custom-ns')
  })
})

describe('@owlmeans/i18n — tier ordering (Library < App)', () => {
  test('App tier entry sorts after Library tier', () => {
    addI18nLib('en', 'labels', { submit: 'Submit (lib)' })
    addI18nApp('en', 'labels', { submit: 'Submit (app)' }, { ns: LIB_NAMESPACE })
    const result = initI18nResource('en', 'labels', LIB_NAMESPACE)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(2)
    expect(result![0].tier).toBe(I18nTier.Library)
    expect(result![1].tier).toBe(I18nTier.App)
  })

  test('in-tier priority tiebreak: lower priority number sorts first', () => {
    addI18nLib('en', 'buttons', { ok: 'OK (low)' }, { priority: 10 })
    addI18nLib('en', 'buttons', { ok: 'OK (high)' }, { priority: 1 })
    const result = initI18nResource('en', 'buttons', LIB_NAMESPACE)
    expect(result![0].priority).toBe(1)
    expect(result![1].priority).toBe(10)
  })
})

describe('@owlmeans/i18n — multi-language', () => {
  test('each language is stored independently', () => {
    addI18nLib('en', 'errors', { minLength: 'Too short' })
    addI18nLib('pl', 'errors', { minLength: 'Zbyt krótkie' })
    const en = initI18nResource('en', 'errors', LIB_NAMESPACE)
    const pl = initI18nResource('pl', 'errors', LIB_NAMESPACE)
    expect(en![0].data.minLength).toBe('Too short')
    expect(pl![0].data.minLength).toBe('Zbyt krótkie')
  })

  test('initI18nResource returns null on second call for the same language (already initialized)', () => {
    addI18nLib('en', 'errors', { minLength: 'Too short' })
    initI18nResource('en', 'errors', LIB_NAMESPACE)
    const second = initI18nResource('en', 'errors', LIB_NAMESPACE)
    expect(second).toBeNull()
  })

  test('SUPPORTED_LNGS contains the seven canonical languages', () => {
    expect(SUPPORTED_LNGS).toEqual(['en', 'pl', 'ru', 'be', 'uk', 'es', 'de'])
  })

  test('DEFAULT_LNG is English', () => {
    expect(DEFAULT_LNG).toBe('en')
  })
})
