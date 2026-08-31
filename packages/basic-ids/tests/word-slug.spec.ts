import { describe, test, expect } from 'bun:test'
import { WORDLIST_A } from '../src/wordlists/list-a.js'
import { WORDLIST_B } from '../src/wordlists/list-b.js'
import { generateWordSlug, nextSlugCandidate } from '../src/helper.js'
import { WORDLIST_SIZE } from '../src/consts.js'

const WORD = /^[a-z]{3,8}$/

/**
 * The invariants the lists are curated to hold. They are asserted here rather than trusted because
 * `generateWordSlug` masks 11 bits to index them: a list that is not exactly 2048 entries long
 * either skews toward its front or indexes past its end, and both fail silently.
 */
describe.each([
  ['list-a', WORDLIST_A],
  ['list-b', WORDLIST_B],
])('%s', (name, list) => {
  test('holds exactly one power-of-two block of words', () => {
    expect(list.length).toBe(WORDLIST_SIZE)
  })

  test('every word is lowercase ascii, 3-8 characters', () => {
    const bad = list.filter(word => !WORD.test(word))
    expect(bad).toEqual([])
  })

  test('has no duplicates', () => {
    expect(new Set(list).size).toBe(list.length)
  })
})

test('the lists are disjoint, so a slug never repeats its own word', () => {
  const a = new Set(WORDLIST_A)
  expect(WORDLIST_B.filter(word => a.has(word))).toEqual([])
})

describe('generateWordSlug', () => {
  test('produces a two-word slug that is a valid DNS label', () => {
    for (let i = 0; i < 200; ++i) {
      const slug = generateWordSlug()
      expect(slug).toMatch(/^[a-z]{3,8}-[a-z]{3,8}$/)
      expect(slug.length).toBeLessThanOrEqual(63)
    }
  })

  test('draws from both lists, in order', () => {
    const [first, second] = generateWordSlug().split('-')
    expect(WORDLIST_A).toContain(first)
    expect(WORDLIST_B).toContain(second)
  })

  test('spreads across the space rather than repeating one pair', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateWordSlug()))
    // 22 bits of entropy: 200 draws colliding more than a handful of times means the index
    // masking is broken, not that we got unlucky.
    expect(seen.size).toBeGreaterThan(190)
  })
})

describe('nextSlugCandidate', () => {
  test('leaves the first attempt bare and numbers the rest', () => {
    expect(nextSlugCandidate('brisk-otter', 1)).toBe('brisk-otter')
    expect(nextSlugCandidate('brisk-otter', 2)).toBe('brisk-otter-2')
    expect(nextSlugCandidate('brisk-otter', 5)).toBe('brisk-otter-5')
  })
})
