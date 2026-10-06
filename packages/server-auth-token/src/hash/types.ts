import type { MintedToken } from '../types.js'

/** Access tokens minted and stored: the plaintext once, the hash forever. */
export interface TokenHashHelper {
  /**
   * The stored form of a token.
   *
   * SHA-256 rather than a password hash on purpose: the input is 192 bits of machine-generated
   * randomness, so there is no dictionary to slow down, and the hash is computed on every single
   * API request — a deliberately slow function here would be a deliberate rate limit on the
   * deployment's whole authenticated surface.
   */
  hashAccessToken: (token: string) => string
  /** Mint one token: the plaintext (returned once), its hash (stored) and its display form. */
  mintAccessToken: (prefix: string) => MintedToken
}
