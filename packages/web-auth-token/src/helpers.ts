import type { AccessTokenView } from '@owlmeans/auth-token'
import type { AccessTokenStatus } from './types.js'
import type { AccessTokenViewHelper } from './helpers/types.js'

export const createAccessTokenViewHelper = (): AccessTokenViewHelper => {
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

  const tokenStatus = (item: AccessTokenView): AccessTokenStatus => {
    if (item.revokedAt != null) return 'revoked'
    const expires = toDate(item.expiresAt)

    return expires != null && expires.getTime() <= Date.now() ? 'expired' : 'active'
  }

  const formatMoment = (
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

  return { tokenStatus, formatMoment }
}

export const accessTokenViewHelper = createAccessTokenViewHelper()
