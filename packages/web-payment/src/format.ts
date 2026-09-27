import { lastWithdrawalDayOf } from '@owlmeans/payment'

/** Minor units as a currency amount in a locale; an unknown locale or currency still reads. */
export const money = (minor: number, currency: string, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2,
    }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

const dateOf = (date: Date | string | null | undefined): Date | null => {
  if (date == null) {
    return null
  }
  const value = date instanceof Date ? date : new Date(date)

  return Number.isNaN(value.getTime()) ? null : value
}

/** A calendar day in UTC (`dateStyle: 'long'`); `''` for no or an unparseable date. */
export const dayUtc = (date: Date | string | null | undefined, locale: string): string => {
  const value = dateOf(date)
  if (value == null) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(value)
  } catch {
    return value.toISOString().slice(0, 10)
  }
}

/**
 * The last day of a window whose deadline is EXCLUSIVE (the start of the next UTC day) — the day a
 * consumer reads as "until". The rule is `@owlmeans/payment`'s `lastWithdrawalDayOf`, the one the
 * server's e-mails and texts use, so the dialog and the mail never name different days.
 */
export const lastDayUtc = (deadline: Date | string | null | undefined, locale: string): string => {
  const value = dateOf(deadline)

  return value == null ? '' : dayUtc(lastWithdrawalDayOf(value), locale)
}

/** A date and time in UTC, to the second — the moment a declaration was received. */
export const momentUtc = (date: Date | string | null | undefined, locale: string): string => {
  const value = dateOf(date)
  if (value == null) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'medium', timeZone: 'UTC' }).format(value)
  } catch {
    return value.toISOString().replace('T', ' ').slice(0, 19)
  }
}

/** A date and time in UTC to the minute, with the zone named — when a limit rises again. */
export const shortMomentUtc = (date: Date | string | null | undefined, locale: string): string => {
  const value = dateOf(date)
  if (value == null) {
    return ''
  }
  try {
    return `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(value)} UTC`
  } catch {
    return `${value.toISOString().replace('T', ' ').slice(0, 16)} UTC`
  }
}
