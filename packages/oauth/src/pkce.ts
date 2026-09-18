import { randomBytes } from '@noble/hashes/utils'
import { base64urlnopad } from '@scure/base'
import { sha256 } from '@noble/hashes/sha256'
import { OAUTH_CODE_VERIFIER_MAX } from './consts.js'

/**
 * PKCE (RFC 7636), S256 only.
 *
 * OAuth 2.1 requires `S256` "when technically capable" — every runtime this family targets (a
 * browser, Node, Bun) carries `SubtleCrypto`-equivalent hashing, so the plain method is never
 * offered.
 */
export interface PkcePair {
  verifier: string
  challenge: string
}

/** A verifier of the maximum allowed length: more entropy costs nothing here. */
export const createPkcePair = (): PkcePair => {
  const verifier = base64urlnopad.encode(randomBytes(Math.floor(OAUTH_CODE_VERIFIER_MAX * 3 / 4)))
    .slice(0, OAUTH_CODE_VERIFIER_MAX)

  return { verifier, challenge: challengeFor(verifier) }
}

export const challengeFor = (verifier: string): string =>
  base64urlnopad.encode(sha256(new TextEncoder().encode(verifier)))

export const verifyPkce = (verifier: string, challenge: string): boolean =>
  challengeFor(verifier) === challenge
