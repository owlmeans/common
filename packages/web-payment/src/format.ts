import { withdrawalDeadlineHelper } from '@owlmeans/payment'
import type { FormatHelper } from './format/types.js'

export const createFormatHelper = (): FormatHelper => {
  const money = (minor: number, currency: string, locale: string): string => {
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

  const dayUtc = (date: Date | string | null | undefined, locale: string): string => {
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

  const lastDayUtc = (deadline: Date | string | null | undefined, locale: string): string => {
    const value = dateOf(deadline)

    return value == null ? '' : dayUtc(withdrawalDeadlineHelper.lastWithdrawalDayOf(value), locale)
  }

  const momentUtc = (date: Date | string | null | undefined, locale: string): string => {
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

  const shortMomentUtc = (date: Date | string | null | undefined, locale: string): string => {
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

  return { money, dayUtc, lastDayUtc, momentUtc, shortMomentUtc }
}

export const formatHelper = createFormatHelper()
