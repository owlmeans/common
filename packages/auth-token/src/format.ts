import { AUTH_TOKEN_DISPLAY_LENGTH } from './consts.js'
import type { AuthorizationHeader, TokenFormatHelper } from './format/types.js'

export const createTokenFormatHelper = (): TokenFormatHelper => {
  const parseAuthorizationHeader = (
    header: string | string[] | undefined
  ): AuthorizationHeader | null => {
    const raw = Array.isArray(header) ? header[0] : header
    if (raw == null) return null

    const trimmed = raw.trim()
    const space = trimmed.indexOf(' ')
    if (space < 1) return null

    const scheme = trimmed.slice(0, space).toLowerCase()
    const value = trimmed.slice(space + 1).trim()
    if (value.length < 1) return null

    return { scheme, value }
  }

  const isAccessToken = (value: string | null | undefined, prefix: string): boolean =>
    value != null && value.length > prefix.length && value.startsWith(prefix)

  const displayOf = (token: string, prefix: string): string => {
    const secret = token.startsWith(prefix) ? token.slice(prefix.length) : token

    return `${prefix}${secret.slice(0, AUTH_TOKEN_DISPLAY_LENGTH)}`
  }

  return { parseAuthorizationHeader, isAccessToken, displayOf }
}

export const tokenFormatHelper = createTokenFormatHelper()
