import { randomBytes } from '@noble/hashes/utils.js'
import { WORDLIST_SIZE, WORD_SLUG_SEPARATOR } from './consts.js'
import { WORDLIST_A, WORDLIST_B } from './wordlists/consts.js'
import { v4 } from 'uuid'
import type { IdHelper } from './helper/types.js'

export const createIdHelper = (): IdHelper => {
  /**
   * Uniform indices into a 2048-entry list. 2048 is a power of two, so masking 16 random bits down
   * to 11 is unbiased — no rejection loop, and no modulo skew toward the front of the list.
   */
  const pickWords = (count: number): number[] => {
    const bytes = randomBytes(count * 2)
    const indices: number[] = []
    for (let i = 0; i < count; ++i) {
      indices.push(((bytes[i * 2] << 8) | bytes[i * 2 + 1]) & (WORDLIST_SIZE - 1))
    }

    return indices
  }

  const uuid = (): string => v4()

  const generateWordSlug = (): string => {
    const [a, b] = pickWords(2)

    return `${WORDLIST_A[a]}${WORD_SLUG_SEPARATOR}${WORDLIST_B[b]}`
  }

  const nextSlugCandidate = (base: string, attempt: number): string =>
    attempt < 2 ? base : `${base}${WORD_SLUG_SEPARATOR}${attempt}`

  return { uuid, generateWordSlug, nextSlugCandidate }
}

export const idHelper = createIdHelper()

/** @deprecated compat:factory-refactor — use `idHelper.uuid()` */
export const uuid = (): string => idHelper.uuid()

/** @deprecated compat:factory-refactor — use `idHelper.generateWordSlug()` */
export const generateWordSlug = (): string => idHelper.generateWordSlug()

/** @deprecated compat:factory-refactor — use `idHelper.nextSlugCandidate(…)` */
export const nextSlugCandidate = (base: string, attempt: number): string => idHelper.nextSlugCandidate(base, attempt)
