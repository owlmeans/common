import { describe, expect, test } from 'bun:test'
import en from '../src/login/i18n/en.json'
import pl from '../src/login/i18n/pl.json'
import ru from '../src/login/i18n/ru.json'
import be from '../src/login/i18n/be.json'
import uk from '../src/login/i18n/uk.json'
import es from '../src/login/i18n/es.json'
import de from '../src/login/i18n/de.json'
import fr from '../src/login/i18n/fr.json'

type Messages = { [key: string]: string | Messages }

/** Every leaf as `branch.key` → message, however deep the resource nests. */
const leaves = (messages: Messages, prefix = ''): Map<string, unknown> => {
  const found = new Map<string, unknown>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (value != null && typeof value === 'object') {
      for (const [leaf, message] of leaves(value, path)) found.set(leaf, message)
    } else {
      found.set(path, value)
    }
  }
  return found
}

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map(match => match[1]).sort()

describe('client-auth login localization', () => {
  const translations: Record<string, Messages> = { en, pl, ru, be, uk, es, de, fr }
  const reference = leaves(en)

  test('ships all eight languages with exact key parity at every depth', () => {
    expect(Object.keys(translations).sort()).toEqual(['be', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'uk'])
    expect(reference.has('login.terms.accept')).toBe(true)
    expect(reference.has('login.terms.notice')).toBe(true)
    expect(reference.has('login.terms.revised')).toBe(true)
    // The removed key never comes back once every renderer has moved off it.
    expect(reference.has('login.terms.agreement')).toBe(false)

    for (const [lng, messages] of Object.entries(translations)) {
      const found = leaves(messages)
      expect({ lng, keys: [...found.keys()].sort() }).toEqual({ lng, keys: [...reference.keys()].sort() })
      for (const [key, message] of found) {
        expect({ lng, key, filled: typeof message === 'string' && message.trim().length > 0 })
          .toEqual({ lng, key, filled: true })
      }
    }
  })

  test('keeps the interpolation placeholders of every message', () => {
    for (const [lng, messages] of Object.entries(translations)) {
      for (const [key, message] of leaves(messages)) {
        expect({ lng, key, placeholders: placeholders(String(message)) })
          .toEqual({ lng, key, placeholders: placeholders(String(reference.get(key))) })
      }
    }
  })

  test('`login.terms.required` no longer names the Privacy Policy specifically', () => {
    for (const [lng, messages] of Object.entries(translations)) {
      const required = leaves(messages).get('login.terms.required')
      expect({ lng, hasDocumentsToken: placeholders(String(required)).includes('documents') })
        .toEqual({ lng, hasDocumentsToken: true })
    }
  })
})
