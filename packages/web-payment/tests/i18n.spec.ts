import { describe, expect, test } from 'bun:test'
import en from '../src/i18n/en.json'
import pl from '../src/i18n/pl.json'
import ru from '../src/i18n/ru.json'
import be from '../src/i18n/be.json'
import uk from '../src/i18n/uk.json'
import es from '../src/i18n/es.json'
import de from '../src/i18n/de.json'

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

describe('web-payment localization', () => {
  const translations: Record<string, Messages> = { en, pl, ru, be, uk, es, de }
  const reference = leaves(en)

  test('ships all seven library languages with exact key parity at every depth', () => {
    expect(Object.keys(translations).sort()).toEqual(['be', 'de', 'en', 'es', 'pl', 'ru', 'uk'])
    expect(reference.has('amount-checkout.title')).toBe(true)
    expect(reference.has('entitlement.status.renews-on')).toBe(true)
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
})
