import { randomBytes } from '@noble/hashes/utils'
import { base58 } from '@scure/base'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import {
  OAUTH_DEVICE_CODE_BYTES, OAUTH_USER_CODE_ALPHABET, OAUTH_USER_CODE_GROUPS,
  OAUTH_USER_CODE_GROUP_LENGTH
} from './consts.js'

/** A high-entropy opaque secret — a device code or an authorization code. Never shown to a
 * person; the client that receives one hands it back verbatim, once. */
export const createOpaqueSecret = (bytes: number = OAUTH_DEVICE_CODE_BYTES): string =>
  base58.encode(randomBytes(bytes))

/** What a server stores and looks an opaque secret up by — never the plaintext itself. Both a
 * device code and an authorization code are hashed this same way, for the same reason an access
 * token is: a stolen database row must not itself be usable as a credential. */
export const hashOAuthSecret = (secret: string): string =>
  bytesToHex(sha256(new TextEncoder().encode(secret)))

/** The high-entropy secret a client polls with. Never shown to a person. */
export const createDeviceCode = (): string => createOpaqueSecret(OAUTH_DEVICE_CODE_BYTES)

/** What a server stores and looks a device code up by — never the plaintext itself. */
export const hashDeviceCode = (deviceCode: string): string => hashOAuthSecret(deviceCode)

/**
 * A short code a person types, or that rides a QR/URL as `verification_uri_complete`.
 *
 * RFC 8628 §6.1's alphabet drops characters that are easy to misread (`0`/`O`, `1`/`I`) and
 * vowels (so no accidental word forms). Rendered `XXXX-XXXX`.
 */
export const createUserCode = (): string => {
  const groups: string[] = []
  for (let g = 0; g < OAUTH_USER_CODE_GROUPS; ++g) {
    const bytes = randomBytes(OAUTH_USER_CODE_GROUP_LENGTH)
    let group = ''
    for (let i = 0; i < OAUTH_USER_CODE_GROUP_LENGTH; ++i) {
      group += OAUTH_USER_CODE_ALPHABET[bytes[i] % OAUTH_USER_CODE_ALPHABET.length]
    }
    groups.push(group)
  }

  return groups.join('-')
}

/** Normalize what a person typed: upper-case, and tolerate a missing or extra dash. */
export const normalizeUserCode = (input: string): string => {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length !== OAUTH_USER_CODE_GROUPS * OAUTH_USER_CODE_GROUP_LENGTH) return cleaned

  return `${cleaned.slice(0, OAUTH_USER_CODE_GROUP_LENGTH)}-${cleaned.slice(OAUTH_USER_CODE_GROUP_LENGTH)}`
}

/** The hostname of a URL, or `null` for a value that does not parse — never throws. */
export const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export const isLoopbackHost = (host: string | null): boolean => host != null && LOOPBACK_HOSTS.has(host)

/**
 * Whether `candidate` matches `registered` under loopback port-agnostic matching (RFC 8252 §7.3,
 * carried into the MCP client-registration guidance): same scheme, same loopback host, same path
 * and query, any port. Every other pair must match byte for byte.
 */
export const matchesRedirectUri = (registered: string, candidate: string): boolean => {
  if (registered === candidate) return true

  try {
    const a = new URL(registered)
    const b = new URL(candidate)
    if (!isLoopbackHost(a.hostname) || !isLoopbackHost(b.hostname)) return false

    return a.protocol === b.protocol && a.pathname === b.pathname && a.search === b.search
  } catch {
    return false
  }
}
