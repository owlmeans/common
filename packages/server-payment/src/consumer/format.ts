import { randomInt } from 'node:crypto'
import { CONTRACT_REF_ALPHABET, RESERVED_MAIL_TLDS } from '../consts.js'
import type { ConsumerFormatHelper } from './format/types.js'
import { withdrawalDeadlineHelper } from '@owlmeans/payment'

export const createConsumerFormatHelper = (): ConsumerFormatHelper => {
  const newContractRef = (at: Date = new Date()): string => {
    const date = [at.getUTCFullYear() % 100, at.getUTCMonth() + 1, at.getUTCDate()]
      .map(part => String(part).padStart(2, '0')).join('')
    const suffix = Array.from({ length: 6 }, () => CONTRACT_REF_ALPHABET[randomInt(CONTRACT_REF_ALPHABET.length)])
      .join('')

    return `CR-${date}-${suffix}`
  }

  const normalizeContractRef = (value: string): string =>
    value.trim().toUpperCase().replace(/[‐-―−\s]+/g, '-')

  const normalizeEmail = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase()

  const isReservedAddress = (address: string): boolean => {
    const bare = normalizeEmail(address).replace(/^.*<([^>]*)>.*$/, '$1')
    const domain = (bare.split('@').pop() ?? '').trim().replace(/\.+$/, '')
    const tld = domain.split('.').pop() ?? ''

    return RESERVED_MAIL_TLDS.includes(tld)
  }

  const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const fractionDigitsOf = (currency: string): number => {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() })
        .resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      return 2
    }
  }

  const formatMoney = (amountMinor: number, currency: string, lng: string): string => {
    const digits = fractionDigitsOf(currency)
    const major = amountMinor / 10 ** digits
    try {
      return new Intl.NumberFormat(lng, { style: 'currency', currency: currency.toUpperCase() }).format(major)
    } catch {
      return `${major.toFixed(digits)} ${currency.toUpperCase()}`
    }
  }

  const formatDateTime = (at: Date, lng: string): string => {
    try {
      return new Intl.DateTimeFormat(lng, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(at)
    } catch {
      return at.toISOString().replace('T', ' ').slice(0, 16)
    }
  }

  const formatDate = (at: Date, lng: string): string => {
    try {
      return new Intl.DateTimeFormat(lng, { dateStyle: 'long', timeZone: 'UTC' }).format(at)
    } catch {
      return at.toISOString().slice(0, 10)
    }
  }

  const formatDeadline = (deadline: Date, lng: string): string =>
    formatDate(withdrawalDeadlineHelper.lastWithdrawalDayOf(deadline), lng)

  const countryName = (country: string, lng: string): string => {
    try {
      return new Intl.DisplayNames([lng], { type: 'region' }).of(country.toUpperCase()) ?? country
    } catch {
      return country
    }
  }

  return {
    newContractRef, normalizeContractRef, normalizeEmail, isReservedAddress, escapeHtml, formatMoney, formatDateTime,
    formatDate, formatDeadline, countryName,
  }
}

export const consumerFormatHelper = createConsumerFormatHelper()
