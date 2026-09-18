import type { AccessTokenView } from '@owlmeans/auth-token'
import type { AccessTokenStatus } from './types.js'

/**
 * A record's date field, whatever shape it arrived in.
 *
 * The record types say `Date`, and JSON over the wire says string — so a component that trusted
 * the type would call `toLocaleString` on a string and throw. An unparseable value answers null
 * rather than `Invalid Date`, which renders as those two words in every language.
 */
const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * What a token's badge says.
 *
 * Revocation outranks expiry: a token revoked before its lifetime ran out is revoked, and saying
 * "expired" about it would suggest it could be renewed. Both outrank `active`, which is what is
 * left when neither happened.
 */
export const tokenStatus = (item: AccessTokenView): AccessTokenStatus => {
  if (item.revokedAt != null) return 'revoked'
  const expires = toDate(item.expiresAt)

  return expires != null && expires.getTime() <= Date.now() ? 'expired' : 'active'
}

/**
 * One of a record's moments, in the reader's own language, or null when there is none.
 *
 * Null is the caller's cue to render its own copy — `never` for a token without an expiry,
 * `never-used` for one nothing has presented yet — because an empty cell says neither.
 */
export const formatMoment = (
  value: Date | string | null | undefined, lng?: string
): string | null => {
  const date = toDate(value)
  if (date == null) return null

  try {
    return new Intl.DateTimeFormat(lng, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    // An unknown language tag throws rather than falling back, and a date is not worth a blank row.
    return date.toISOString()
  }
}
