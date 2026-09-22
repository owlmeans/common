import { describe, expect, test } from 'bun:test'
import { challengeFor, createPkcePair, verifyPkce } from '../src/pkce.js'
import { OAUTH_CODE_VERIFIER_MAX, OAUTH_CODE_VERIFIER_MIN } from '../src/consts.js'

describe('PKCE (S256)', () => {
  test('creates a verifier within the RFC 7636 length bounds', () => {
    const { verifier } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(OAUTH_CODE_VERIFIER_MIN)
    expect(verifier.length).toBeLessThanOrEqual(OAUTH_CODE_VERIFIER_MAX)
  })

  test('the challenge is deterministic and verifies against its own verifier', () => {
    const pair = createPkcePair()
    expect(challengeFor(pair.verifier)).toBe(pair.challenge)
    expect(verifyPkce(pair.verifier, pair.challenge)).toBe(true)
  })

  test('a different verifier never verifies', () => {
    const a = createPkcePair()
    const b = createPkcePair()
    expect(verifyPkce(a.verifier, b.challenge)).toBe(false)
  })
})
