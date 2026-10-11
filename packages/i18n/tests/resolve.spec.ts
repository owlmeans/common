import { describe, expect, test, beforeEach } from 'bun:test'
import {
  LIB_NAMESPACE, i18nHelper
} from '@owlmeans/i18n'
import { resetStorage } from './context.js'

beforeEach(resetStorage)

describe('@owlmeans/i18n — i18nHelper.resolveI18nResource', () => {
  test('an app bundle merges over the library bundle of the same slot, key by key', () => {
    i18nHelper.addI18nLib('de', 'legal', { withdrawal: { function: 'Vertrag widerrufen', confirm: 'Widerruf bestätigen' } })
    i18nHelper.addI18nApp('de', 'legal', { withdrawal: { confirm: 'Bestätigen' } }, { ns: LIB_NAMESPACE })

    expect(i18nHelper.resolveI18nResource('de', 'legal', LIB_NAMESPACE)).toEqual({
      withdrawal: { function: 'Vertrag widerrufen', confirm: 'Bestätigen' },
    })
  })

  test('within a tier a bundle with no priority is merged last and wins', () => {
    i18nHelper.addI18nLib('en', 'labels', { ok: 'unset' })
    i18nHelper.addI18nLib('en', 'labels', { ok: 'ten', extra: 'kept' }, { priority: 10 })

    expect(i18nHelper.resolveI18nResource('en', 'labels', LIB_NAMESPACE)).toEqual({ ok: 'unset', extra: 'kept' })
  })

  test('reads any language without draining it', () => {
    i18nHelper.addI18nLib('fr', 'legal', { title: 'Rétractation' })
    i18nHelper.addI18nLib('pl', 'legal', { title: 'Odstąpienie' })

    expect(i18nHelper.resolveI18nResource('fr', 'legal', LIB_NAMESPACE)).toEqual({ title: 'Rétractation' })
    expect(i18nHelper.resolveI18nResource('fr', 'legal', LIB_NAMESPACE)).toEqual({ title: 'Rétractation' })

    const drained = i18nHelper.initI18nResource('fr', 'legal', LIB_NAMESPACE)
    expect(drained).not.toBeNull()
    expect(drained![0].data).toEqual({ title: 'Rétractation' })
    expect(i18nHelper.initI18nResource('fr', 'legal', LIB_NAMESPACE)).toBeNull()

    // A drained slot still resolves: the bundles stay registered.
    expect(i18nHelper.resolveI18nResource('fr', 'legal', LIB_NAMESPACE)).toEqual({ title: 'Rétractation' })
    expect(i18nHelper.resolveI18nResource('pl', 'legal', LIB_NAMESPACE)).toEqual({ title: 'Odstąpienie' })
  })

  test('answers null for an empty slot without creating it', () => {
    expect(i18nHelper.resolveI18nResource('es', 'nothing', LIB_NAMESPACE)).toBeNull()
    i18nHelper.addI18nLib('es', 'nothing', { a: 'b' })
    expect(i18nHelper.initI18nResource('es', 'nothing', LIB_NAMESPACE)).toHaveLength(1)
  })

  test('the merged result never aliases a registered bundle', () => {
    const data = { nested: { key: 'value' }, list: ['a'] }
    i18nHelper.addI18nLib('en', 'owned', data)

    const merged = i18nHelper.resolveI18nResource('en', 'owned', LIB_NAMESPACE) as typeof data
    merged.nested.key = 'changed'
    merged.list.push('b')

    expect(data).toEqual({ nested: { key: 'value' }, list: ['a'] })
  })

  test('the namespace defaults to the i18next default one', () => {
    i18nHelper.addI18nApp('en', 'my-app', { title: 'App' }, { ns: 'translation' })
    expect(i18nHelper.resolveI18nResource('en', 'my-app')).toEqual({ title: 'App' })
  })
})
