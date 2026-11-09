import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import fr from '../src/i18n/fr.json' with { type: 'json' }
import authEn from '../src/i18n/auth/en.json' with { type: 'json' }
import authPl from '../src/i18n/auth/pl.json' with { type: 'json' }
import authRu from '../src/i18n/auth/ru.json' with { type: 'json' }
import authBe from '../src/i18n/auth/be.json' with { type: 'json' }
import authUk from '../src/i18n/auth/uk.json' with { type: 'json' }
import authEs from '../src/i18n/auth/es.json' with { type: 'json' }
import authDe from '../src/i18n/auth/de.json' with { type: 'json' }
import authFr from '../src/i18n/auth/fr.json' with { type: 'json' }
import { EMAIL_AUTH_LOCALES } from '@owlmeans/auth-email'

const LANGUAGES: Record<string, unknown> = { en, pl, ru, be, uk, es, de, fr }
const AUTH: Record<string, { login: { method: { email: string } } }> = {
  en: authEn, pl: authPl, ru: authRu, be: authBe, uk: authUk, es: authEs, de: authDe, fr: authFr,
}

/** Every leaf key path in a nested translation object, e.g. `login.title`. */
const leaves = (value: unknown, prefix = ''): string[] => typeof value !== 'object' || value == null
  ? [prefix]
  : Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => leaves(child, prefix === '' ? key : `${prefix}.${key}`))

const valueOf = (resource: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], resource)

const placeholders = (text: string): string[] => [...text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(m => m[1]).sort()

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)

  return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : []
})

/** Every `t('key', 'English default')` in the sources, with its default. */
const used = (): Map<string, string> => {
  const result = new Map<string, string>()
  const call = /\bt\(\s*'([^']+)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
  for (const file of sourceFiles(join(import.meta.dir, '../src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(call)) {
      result.set(match[1], (match[2] ?? match[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
    }
  }

  return result
}

describe('@owlmeans/web-auth-email — translations', () => {
  const english = leaves(en).sort()

  test('ships exactly the eight sign-in languages', () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual([...EMAIL_AUTH_LOCALES].sort())
    expect(Object.keys(AUTH).sort()).toEqual([...EMAIL_AUTH_LOCALES].sort())
  })

  for (const [lng, resource] of Object.entries(LANGUAGES)) {
    test(`${lng}: the same keys as English, none empty, the same placeholders`, () => {
      expect(leaves(resource).sort()).toEqual(english)
      for (const key of english) {
        const value = valueOf(resource, key)
        expect(typeof value === 'string' && value.trim() !== '').toBe(true)
        expect(placeholders(value as string)).toEqual(placeholders(valueOf(en, key) as string))
      }
    })
  }

  test('every key a component asks for exists, and its English default is the bundle text', () => {
    const keys = used()
    // An empty scan would make the rest pass vacuously.
    expect(keys.size).toBeGreaterThanOrEqual(60)
    for (const [key, defaultValue] of keys) {
      expect(valueOf(en, key)).toBe(defaultValue)
    }
    // …and nothing in the bundle is dead.
    expect([...keys.keys()].sort()).toEqual(english)
  })

  test('login.method.email reaches the auth resource in every language', () => {
    for (const resource of Object.values(AUTH)) {
      expect(leaves(resource)).toEqual(['login.method.email'])
      expect(resource.login.method.email.trim()).not.toBe('')
    }
    expect(authEn.login.method.email).toBe('Continue with email')
  })
})
