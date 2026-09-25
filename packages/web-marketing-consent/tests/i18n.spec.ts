import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import fr from '../src/i18n/fr.json' with { type: 'json' }

const LANGUAGES: Record<string, unknown> = { pl, ru, be, uk, es, de, fr }

/** Every leaf key path in a nested translation object, e.g. `screen.title`. */
const leafKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value == null) return [prefix]

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => leafKeys(child, prefix === '' ? key : `${prefix}.${key}`))
}

describe('@owlmeans/web-marketing-consent — translations', () => {
  const englishKeys = leafKeys(en).sort()

  test('English covers the screen and the preferences card', () => {
    expect(englishKeys).toContain('screen.save')
    expect(englishKeys).toContain('screen.gpc')
    expect(englishKeys).toContain('preferences.save')
    expect(englishKeys).toContain('screen.last-updated')
    expect(englishKeys).toContain('screen.required-note')
    expect(englishKeys).toContain('screen.required')
  })

  test('no cookie wording is left — the marketing screen has no cookie integration', () => {
    expect(englishKeys).not.toContain('screen.cookie-linked')
    expect(englishKeys).not.toContain('screen.from-cookies')
  })

  test('the last-updated line keeps its date placeholder in every language', () => {
    for (const resource of [en, ...Object.values(LANGUAGES)] as Array<{ screen: Record<string, string> }>) {
      expect(resource.screen['last-updated']).toContain('{{date}}')
    }
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

  test('every literal screen.*/preferences.* key used by the components has an English entry', () => {
    const componentsDir = join(import.meta.dir, '../src/components')
    const sources = ['screen.tsx', 'preferences.tsx', 'fields.tsx', 'terms.tsx', 'row.tsx', 'inline.tsx']
      .map(file => readFileSync(join(componentsDir, file), 'utf8'))

    const used = new Set<string>()
    for (const text of sources) {
      for (const match of text.matchAll(/t\(\s*'((?:screen|preferences)\.[a-zA-Z0-9.-]+)'/g)) {
        used.add(match[1])
      }
    }

    // A regression here (an empty set) would make the rest of this test vacuously pass.
    expect(used.size).toBeGreaterThanOrEqual(10)
    for (const key of used) {
      expect(englishKeys).toContain(key)
    }
  })
})
