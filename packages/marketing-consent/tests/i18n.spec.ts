import { describe, expect, test } from 'bun:test'
import { CONSENT_LOCALES } from '@owlmeans/consent'
import { STANDARD_MARKETING_CONSENTS } from '../src/consts.js'

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

    expect(CONSENT_LOCALES).toHaveLength(8)
    for (const lng of CONSENT_LOCALES) {
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
})
