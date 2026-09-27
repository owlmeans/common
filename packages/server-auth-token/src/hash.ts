import { AUTH_TOKEN_SECRET_BYTES, displayOf } from '@owlmeans/auth-token'
import { base58 } from '@scure/base'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, randomBytes } from '@noble/hashes/utils'

/**
 * The stored form of a token.
 *
 * SHA-256 rather than a password hash on purpose: the input is 192 bits of machine-generated
 * randomness, so there is no dictionary to slow down, and the hash is computed on every single
 * API request — a deliberately slow function here would be a deliberate rate limit on the
 * deployment's whole authenticated surface.
 */
export const hashAccessToken = (token: string): string => bytesToHex(sha256(new TextEncoder().encode(token)))

export interface MintedToken {
  token: string
  hash: string
  display: string
}

/** Mint one token: the plaintext (returned once), its hash (stored) and its display form. */
export const mintAccessToken = (prefix: string): MintedToken => {
  const token = `${prefix}${base58.encode(randomBytes(AUTH_TOKEN_SECRET_BYTES))}`

  return { token, hash: hashAccessToken(token), display: displayOf(token, prefix) }
}
