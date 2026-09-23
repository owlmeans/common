import { describe, expect, test } from 'bun:test'
import { indexChanged } from '../src/utils/indexes.js'

/**
 * No gate: this is the pure decision behind `updateIndexes`, and the case that matters needs no
 * database — an index the server reports back is compared against the declaration it came from.
 */
describe('@owlmeans/mongo-resource — index comparison', () => {
  const declared = { key: { currentJobId: 1 }, sparse: true, unique: true }

  test('the same index reported in the server\'s own option order is unchanged', () => {
    // What the server answers for exactly this declaration — options in its order, plus `v`.
    expect(indexChanged({ v: 2, key: { currentJobId: 1 }, unique: true, sparse: true }, declared)).toBe(false)
  })

  test('fields the server reports rather than the declaration asks for are not a change', () => {
    const reported = {
      v: 2, key: { currentJobId: 1 }, unique: true, sparse: true, background: false,
      collation: { locale: 'en', strength: 2 },
    }
    expect(indexChanged(reported, declared)).toBe(false)
  })

  test('a changed option, a dropped option and a changed key are changes', () => {
    expect(indexChanged({ v: 2, key: { currentJobId: 1 }, unique: false, sparse: true }, declared)).toBe(true)
    expect(indexChanged({ v: 2, key: { currentJobId: 1 }, unique: true }, declared)).toBe(true)
    expect(indexChanged({ v: 2, key: { currentJobId: -1 }, unique: true, sparse: true }, declared)).toBe(true)
  })

  test('a compound index compares its key in order', () => {
    const compound = { key: { entityId: 1, createdAt: -1 } }
    expect(indexChanged({ v: 2, key: { entityId: 1, createdAt: -1 } }, compound)).toBe(false)
    expect(indexChanged({ v: 2, key: { createdAt: -1, entityId: 1 } }, compound)).toBe(true)
  })

  test('a text index is never recreated', () => {
    const text = { v: 2, key: { _fts: 'text', _ftsx: 1 }, weights: { title: 1 }, textIndexVersion: 3 }
    expect(indexChanged(text, { key: { title: 'text' } })).toBe(false)
  })
})
