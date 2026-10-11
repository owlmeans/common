import type { PkcePair } from '../types.js'

/** PKCE (RFC 7636, `S256` only): a verifier/challenge pair and its verification. */
export interface PkceHelper {
  /** A verifier of the maximum allowed length: more entropy costs nothing here. */
  createPkcePair: () => PkcePair
  challengeFor: (verifier: string) => string
  verifyPkce: (verifier: string, challenge: string) => boolean
}
