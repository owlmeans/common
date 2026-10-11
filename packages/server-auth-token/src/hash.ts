import { AUTH_TOKEN_SECRET_BYTES, tokenFormatHelper } from '@owlmeans/auth-token'
import { base58 } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { MintedToken } from './types.js'
import type { TokenHashHelper } from './hash/types.js'

export const createTokenHashHelper = (): TokenHashHelper => {
  const hashAccessToken = (token: string): string => bytesToHex(sha256(new TextEncoder().encode(token)))

  const mintAccessToken = (prefix: string): MintedToken => {
    const token = `${prefix}${base58.encode(randomBytes(AUTH_TOKEN_SECRET_BYTES))}`

    return { token, hash: hashAccessToken(token), display: tokenFormatHelper.displayOf(token, prefix) }
  }

  return { hashAccessToken, mintAccessToken }
}

export const tokenHashHelper = createTokenHashHelper()

/** @deprecated compat:factory-refactor — use `tokenHashHelper.hashAccessToken(…)` */
export const hashAccessToken = (token: string): string => tokenHashHelper.hashAccessToken(token)
