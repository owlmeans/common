import { describe, expect, test } from 'bun:test'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }

const LANGUAGES: Record<string, unknown> = { pl, ru, be, uk, es, de }

/** Every leaf key path in a nested translation object, e.g. `consent.title`. */
const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value == null) return [prefix]

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => leafKeys(child, prefix === '' ? key : `${prefix}.${key}`))
}

describe('@owlmeans/web-oauth — translations', () => {
  const englishKeys = leafKeys(en).sort()

  test('English covers the three screens', () => {
    expect(englishKeys).toContain('consent.approve')
    expect(englishKeys).toContain('device.continue')
    expect(englishKeys).toContain('done.message')
  })

  for (const [lang, resource] of Object.entries(LANGUAGES)) {
    test(`${lang} has exactly the same keys as English`, () => {
      expect(leafKeys(resource).sort()).toEqual(englishKeys)
    })

    test(`${lang} has no empty translation`, () => {
      for (const key of leafKeys(resource)) {
        const value = key.split('.').reduce((node: any, part) => node[part], resource)
        expect(typeof value === 'string' && value.trim() !== '').toBe(true)
      }
    })
  }
})
