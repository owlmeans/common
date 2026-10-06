import { describe, expect, test } from 'bun:test'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import * as errors from '../src/errors.js'

const keysOf = (node: unknown, prefix: string = ''): string[] => node != null && typeof node === 'object'
  ? Object.entries(node).flatMap(([key, value]) => keysOf(value, `${prefix}${key}.`))
  : [prefix.slice(0, -1)]

const load = async (lng: string): Promise<unknown> =>
  (await import(`../src/i18n/${lng}.json`, { with: { type: 'json' } })).default

describe('i18n', () => {
  test('all seven languages carry exactly the same keys, none empty', async () => {
    const english = keysOf(await load('en')).sort()

    expect(SUPPORTED_LNGS).toHaveLength(7)
    for (const lng of SUPPORTED_LNGS) {
      const data = await load(lng)
      expect(keysOf(data).sort()).toEqual(english)
      expect(JSON.stringify(data)).not.toContain('""')
    }
  })

  test('every registered refusal class has an error text', async () => {
    const texts = (await load('en') as { errors: Record<string, string> }).errors
    const types = Object.values(errors).map(errorClass => (errorClass as { typeName: string }).typeName)

    expect(types.filter(type => texts[type] == null)).toEqual([])
  })
})
