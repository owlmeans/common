import { randomBytes, bytesToHex } from '@noble/hashes/utils.js'
import { base58 } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  OAUTH_DEVICE_CODE_BYTES, OAUTH_USER_CODE_ALPHABET, OAUTH_USER_CODE_GROUPS,
  OAUTH_USER_CODE_GROUP_LENGTH
} from './consts.js'
import { LOOPBACK_HOSTS } from './consts.local.js'
import type { OAuthFormatHelper } from './format/types.js'

export const createOAuthFormatHelper = (): OAuthFormatHelper => {
  const createOpaqueSecret = (bytes: number = OAUTH_DEVICE_CODE_BYTES): string =>
    base58.encode(randomBytes(bytes))

  const hashOAuthSecret = (secret: string): string =>
    bytesToHex(sha256(new TextEncoder().encode(secret)))

  const createDeviceCode = (): string => createOpaqueSecret(OAUTH_DEVICE_CODE_BYTES)

  const hashDeviceCode = (deviceCode: string): string => hashOAuthSecret(deviceCode)

  const createUserCode = (): string => {
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

  const normalizeUserCode = (input: string): string => {
    const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleaned.length !== OAUTH_USER_CODE_GROUPS * OAUTH_USER_CODE_GROUP_LENGTH) return cleaned

    return `${cleaned.slice(0, OAUTH_USER_CODE_GROUP_LENGTH)}-${cleaned.slice(OAUTH_USER_CODE_GROUP_LENGTH)}`
  }

  const hostOf = (url: string): string | null => {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }

  const isLoopbackHost = (host: string | null): boolean => host != null && LOOPBACK_HOSTS.has(host)

  const matchesRedirectUri = (registered: string, candidate: string): boolean => {
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

  return {
    createOpaqueSecret, hashOAuthSecret, createDeviceCode, hashDeviceCode, createUserCode, normalizeUserCode,
    hostOf, isLoopbackHost, matchesRedirectUri,
  }
}

export const oauthFormatHelper = createOAuthFormatHelper()
