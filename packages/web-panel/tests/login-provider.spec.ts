import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loginProviderHelper } from '@owlmeans/client-panel/auth'
import type { LoginProviderModel } from '@owlmeans/client-panel/auth'

const brand = { name: 'Ovenlore' }

describe('loginProviderHelper.resolve — who signs the person in', () => {
  test('resolves a full disclosure, keeping every configured value', () => {
    expect(loginProviderHelper.resolve(
      { name: 'OwlMeans IAM', operator: 'OwlMeans', info: 'https://owlmeans.com/iam/about', placement: 'top' },
      brand
    )).toEqual({
      name: 'OwlMeans IAM', operator: 'OwlMeans', product: 'Ovenlore',
      info: 'https://owlmeans.com/iam/about', placement: 'top',
    })
  })

  test('the operator defaults to the provider and the placement to inline', () => {
    expect(loginProviderHelper.resolve({ name: 'OwlMeans IAM' }, brand)).toEqual({
      name: 'OwlMeans IAM', operator: 'OwlMeans IAM', product: 'Ovenlore', info: null, placement: 'inline',
    })
  })

  test('null without a provider name, a product, or any configuration at all', () => {
    expect(loginProviderHelper.resolve(undefined, brand)).toBeNull()
    expect(loginProviderHelper.resolve({ name: 'OwlMeans IAM' }, undefined)).toBeNull()
    expect(loginProviderHelper.resolve({ name: 'OwlMeans IAM' }, {})).toBeNull()
  })

  test('blank strings are unset — the shape an undelivered build-time variable arrives in', () => {
    expect(loginProviderHelper.resolve({ name: '  ' }, brand)).toBeNull()
    expect(loginProviderHelper.resolve({ name: 'OwlMeans IAM' }, { name: '' })).toBeNull()
    expect(loginProviderHelper.resolve({ name: 'OwlMeans IAM', operator: '', info: ' ' }, brand))
      .toMatchObject({ operator: 'OwlMeans IAM', info: null })
  })

  test('an unknown placement falls back to inline', () => {
    expect(loginProviderHelper.resolve({ name: 'IAM', placement: 'side' as never }, brand)?.placement)
      .toBe('inline')
  })

  test('the info link is an absolute http(s) URL or a root-relative path, and nothing else', () => {
    const info = (value: string) => loginProviderHelper.resolve({ name: 'IAM', info: value }, brand)?.info

    expect(info('https://owlmeans.com')).toBe('https://owlmeans.com')
    expect(info('http://localhost:3000/iam/about')).toBe('http://localhost:3000/iam/about')
    expect(info('/iam/about')).toBe('/iam/about')

    expect(info('javascript:alert(1)')).toBeNull()
    expect(info('data:text/html,hi')).toBeNull()
    expect(info('//evil.test/about')).toBeNull()
    expect(info('/\\evil.test')).toBeNull()
    expect(info('iam/about')).toBeNull()
    expect(info('mailto:someone@example.test')).toBeNull()
  })
})

describe('loginProviderHelper.fill — names put in after translation', () => {
  const model: LoginProviderModel = {
    name: 'OwlMeans IAM', operator: 'OwlMeans', product: 'Ovenlore', info: null, placement: 'top',
  }

  test('replaces every placeholder it knows', () => {
    expect(loginProviderHelper.fill(
      'This app is hosted by {{operator}} on behalf of {{product}}. You sign in with {{provider}}.', model
    )).toBe('This app is hosted by OwlMeans on behalf of Ovenlore. You sign in with OwlMeans IAM.')
  })

  test('one pass: a name carrying a placeholder is never expanded again', () => {
    expect(loginProviderHelper.fill('{{product}} / {{provider}}', { ...model, product: '{{provider}}' }))
      .toBe('{{provider}} / OwlMeans IAM')
  })

  test('leaves an unknown placeholder alone', () => {
    expect(loginProviderHelper.fill('{{product}} {{other}}', model)).toBe('Ovenlore {{other}}')
  })
})

describe('login.provider.* — eight languages, one shape', () => {
  const dir = join(import.meta.dir, '../src/components/login/i18n')
  const LANGUAGES = ['be', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'uk']
  const read = (lng: string) =>
    JSON.parse(readFileSync(join(dir, `${lng}.json`), 'utf8')) as { login: { provider: Record<string, string> } }
  const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort()

  test('ships exactly the eight languages', () => {
    expect(readdirSync(dir).map(file => file.replace(/\.json$/, '')).sort()).toEqual(LANGUAGES)
  })

  test('every language carries the same keys, each translated, with the same placeholders', () => {
    const en = read('en').login.provider
    expect(Object.keys(en).sort()).toEqual(['inline', 'more', 'title', 'top'])

    for (const lng of LANGUAGES) {
      const bundle = read(lng)
      // Nothing but `login.provider` — the rest of `login` belongs to `@owlmeans/client-auth`.
      expect({ lng, roots: Object.keys(bundle), login: Object.keys(bundle.login) })
        .toEqual({ lng, roots: ['login'], login: ['provider'] })
      expect({ lng, keys: Object.keys(bundle.login.provider).sort() })
        .toEqual({ lng, keys: Object.keys(en).sort() })

      for (const [key, text] of Object.entries(bundle.login.provider)) {
        expect({ lng, key, blank: text.trim() === '' }).toEqual({ lng, key, blank: false })
        expect({ lng, key, placeholders: placeholders(text) })
          .toEqual({ lng, key, placeholders: placeholders(en[key]) })
        if (lng !== 'en' && key !== 'more') {
          expect({ lng, key, untranslated: text === en[key] }).toEqual({ lng, key, untranslated: false })
        }
      }
    }
  })
})
