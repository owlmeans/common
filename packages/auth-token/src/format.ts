import { AUTH_TOKEN_DISPLAY_LENGTH } from './consts.js'

/**
 * Split an `Authorization` header into its scheme and its value.
 *
 * Deliberately NOT `extractAuthToken` from `@owlmeans/auth-common`: that compares the prefix
 * against `type.toUpperCase()`, so it matches `AUTH-TOKEN` and can never match `Bearer` — the
 * exact spelling every third-party client sends. The scheme comes back lower-cased so a caller
 * compares once.
 */
export const parseAuthorizationHeader = (
  header: string | string[] | undefined
): { scheme: string, value: string } | null => {
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

/** Whether a value looks like an access token this deployment issued. */
export const isAccessToken = (value: string | null | undefined, prefix: string): boolean =>
  value != null && value.length > prefix.length && value.startsWith(prefix)

/**
 * The half of a token that may be shown again.
 *
 * Prefix plus the first characters of the secret. Enough to tell two tokens apart in a list, and
 * far short of anything that could be replayed.
 */
export const displayOf = (token: string, prefix: string): string => {
  const secret = token.startsWith(prefix) ? token.slice(prefix.length) : token

  return `${prefix}${secret.slice(0, AUTH_TOKEN_DISPLAY_LENGTH)}`
}
