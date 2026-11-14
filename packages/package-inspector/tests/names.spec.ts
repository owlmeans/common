import { describe, expect, test } from 'bun:test'
import { PACKAGE_VARIANT_LIMIT, packageNameHelper } from '../src/index.js'

describe('@owlmeans/package-inspector — package names', () => {
  test('the Damerau-Levenshtein distance counts an adjacent transposition as one edit', () => {
    expect(packageNameHelper.distance('loadsh', 'lodash')).toBe(1)
    expect(packageNameHelper.distance('momnet', 'moment')).toBe(1)
    // Unrestricted: a transposition followed by an insertion between the swapped letters.
    expect(packageNameHelper.distance('ca', 'abc')).toBe(2)
    expect(packageNameHelper.distance('kitten', 'sitting')).toBe(3)
    expect(packageNameHelper.distance('', 'abc')).toBe(3)
  })

  test('variants reach the genuine names of known typosquats, most likely first and bounded', () => {
    expect(packageNameHelper.variants('loadsh')).toContain('lodash')
    expect(packageNameHelper.variants('momnet')).toContain('moment')
    expect(packageNameHelper.variants('@acme/lodash')[0]).toBe('lodash')
    expect(packageNameHelper.variants('@tyeps/node')).toContain('@types/node')
    expect(packageNameHelper.variants('lodash.get').slice(0, 8)).toEqual(expect.arrayContaining(['lodash-get', 'lodash_get', 'lodashget']))
    expect(packageNameHelper.variants('dayjs')).toEqual(expect.arrayContaining(['day', 'day-js', 'day.js', 'node-dayjs']))

    const all = packageNameHelper.variants('Lodash')
    expect(all).not.toContain('lodash')
    expect(new Set(all).size).toBe(all.length)
    expect(all.every(name => packageNameHelper.isValid(name) && !name.startsWith('-') && !name.startsWith('.'))).toBe(true)
    expect(packageNameHelper.variants('lodash', { limit: 10 })).toHaveLength(10)
    expect(packageNameHelper.variants('a-really-long-package-name-for-bounds').length).toBe(PACKAGE_VARIANT_LIMIT)
  })

  test('normalisation drops the scope, separators and common affixes', () => {
    expect(packageNameHelper.split('@Types/Node')).toEqual({ scope: 'types', base: 'node' })
    expect(packageNameHelper.split('lodash')).toEqual({ base: 'lodash' })
    expect(packageNameHelper.normalise('@x/Lodash.Get')).toBe('lodashget')
    expect(packageNameHelper.stem('node-lodash.js')).toBe('lodash')
    expect(packageNameHelper.related('day.js', 'dayjs')).toBe(true)
    expect(packageNameHelper.related('loadsh', 'lodash', 1)).toBe(true)
    expect(packageNameHelper.related('acme-monorepo', 'acme-widgets-ui')).toBe(false)
    expect(['lodash', '@types/node', '.hidden', '_x', 'Upper', 'a b'].map(packageNameHelper.isValid))
      .toEqual([true, true, false, false, false, false])
  })
})
