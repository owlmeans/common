import { describe, expect, test } from 'bun:test'
import { STANDARD_MARKETING_CONSENTS } from '../src/consts.js'

/** The 8 languages the OwlMeans consent packages ship. */
const LOCALES = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']

const keysOf = (node: unknown, prefix: string = ''): string[] => node != null && typeof node === 'object'
  ? Object.entries(node).flatMap(([key, value]) => keysOf(value, `${prefix}${key}.`))
  : [prefix.slice(0, -1)]

const load = async (lng: string): Promise<Record<string, unknown>> =>
  (await import(`../src/i18n/${lng}.json`, { with: { type: 'json' } })).default

const readPath = (data: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((node, segment) => (node != null && typeof node === 'object'
    ? (node as Record<string, unknown>)[segment]
    : undefined), data)

describe('i18n', () => {
  test('all 8 marketing-consent languages carry exactly the same keys, none empty', async () => {
    const english = keysOf(await load('en')).sort()

    for (const lng of LOCALES) {
      const data = await load(lng)
      expect(keysOf(data).sort()).toEqual(english)
      expect(JSON.stringify(data)).not.toContain('""')
    }
  })

  test('every labelKey/descriptionKey the standard catalogue declares resolves in en.json', async () => {
    const en = await load('en')

    STANDARD_MARKETING_CONSENTS.forEach(definition => {
      expect(readPath(en, definition.labelKey!)).toBeString()
      expect(readPath(en, definition.descriptionKey!)).toBeString()
    })
  })

  test('every statement begins with the confirmation and every description carries the policy link inside its text', async () => {
    const en = await load('en')

    STANDARD_MARKETING_CONSENTS.forEach(definition => {
      expect(readPath(en, definition.labelKey!) as string).toStartWith('I confirm that I agree')
      expect(readPath(en, definition.descriptionKey!) as string).toContain('{{link}}')
    })
  })

  test('every language keeps the {{link}} placeholder of every description, and offers the link a label', async () => {
    for (const lng of LOCALES) {
      const data = await load(lng)
      STANDARD_MARKETING_CONSENTS.forEach(definition => {
        expect(readPath(data, definition.descriptionKey!) as string).toContain('{{link}}')
      })
      expect(readPath(data, 'link.privacy')).toBeString()
    }
  })

  test('no tracker wording is left in any language', async () => {
    for (const lng of LOCALES) {
      const data = await load(lng)
      expect(readPath(data, 'group.trackers')).toBeUndefined()
      expect(readPath(data, 'consent.trackers')).toBeUndefined()
    }
  })
})
