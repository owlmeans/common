
import { randomBytes } from '@noble/hashes/utils'
import { base58, base64urlnopad } from '@scure/base'
import { IdStyle, WORDLIST_SIZE, WORD_SLUG_SEPARATOR } from './consts.js'
import { WORDLIST_A } from './wordlists/list-a.js'
import { WORDLIST_B } from './wordlists/list-b.js'
import { v4 } from 'uuid'

export const createRandomPrefix = (length: number = 6, format: IdStyle = IdStyle.Base58): string => {
  const rand = randomBytes(length)
  switch (format) {
    case IdStyle.Base64:
      return base64urlnopad.encode(rand)
    case IdStyle.Base58:
    default:
      return base58.encode(rand)
  }
}

export const createIdOfLength = (length: number = 6, format: IdStyle = IdStyle.Base58): string => {
  return createRandomPrefix(length * 2, format).slice(0, length)
}

export const uuid = (): string => v4()

/**
 * A human-readable slug: one descriptive word, one subject word — `civil-format`, `raised-earth`.
 *
 * This exists because the values it replaces are read by people. An organization slug turns up in
 * hostnames, OIDC client ids and support conversations, and a 16-character Base58 string is
 * unquotable over the phone and unrecognisable in a list. Two words out of 2048 each give 22 bits
 * of entropy — far short of a secret, and deliberately so: uniqueness here is settled by a unique
 * index and `nextSlugCandidate`, not by entropy. Never use this for anything that must be
 * unguessable (nonces, secrets, tokens) — `createIdOfLength` is that function.
 */
export const generateWordSlug = (): string => {
  const [a, b] = pickWords(2)

  return `${WORDLIST_A[a]}${WORD_SLUG_SEPARATOR}${WORDLIST_B[b]}`
}

/**
 * The n-th candidate for an occupied slug: `brisk-otter`, `brisk-otter-2`, `brisk-otter-3`.
 *
 * The first attempt is the bare name — a suffix appears only once something already answers to it,
 * so the common case keeps the name it was given. Callers own the availability test (a unique
 * index, a registry claim) and walk this until one is free.
 */
export const nextSlugCandidate = (base: string, attempt: number): string =>
  attempt < 2 ? base : `${base}${WORD_SLUG_SEPARATOR}${attempt}`

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
