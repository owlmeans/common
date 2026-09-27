import { randomInt } from 'node:crypto'
import { lastWithdrawalDayOf } from '@owlmeans/payment'
import { CONTRACT_REF_ALPHABET, RESERVED_MAIL_TLDS } from '../consts.js'

/** `CR-YYMMDD-XXXXXX` — the purchase's UTC date and six characters of an unambiguous alphabet. */
export const makeContractRef = (at: Date = new Date()): string => {
  const date = [at.getUTCFullYear() % 100, at.getUTCMonth() + 1, at.getUTCDate()]
    .map(part => String(part).padStart(2, '0')).join('')
  const suffix = Array.from({ length: 6 }, () => CONTRACT_REF_ALPHABET[randomInt(CONTRACT_REF_ALPHABET.length)]).join('')

  return `CR-${date}-${suffix}`
}

/** A contract reference as a person may type it: trimmed, upper-cased, look-alike dashes unified. */
export const normalizeContractRef = (value: string): string =>
  value.trim().toUpperCase().replace(/[‐-―−\s]+/g, '-')

export const normalizeEmail = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase()

/**
 * Whether an address is on a reserved top-level domain (`.test`, `.example`, `.invalid`,
 * `.localhost` — RFC 2606 / 6761), any subdomain included: `a@shop.test`, `a@mail.shop.test`,
 * `a@localhost`. Case, surrounding spaces, a display-name form (`Name <a@shop.test>`) and a
 * trailing root dot are all read through.
 */
export const isReservedAddress = (address: string): boolean => {
  const bare = normalizeEmail(address).replace(/^.*<([^>]*)>.*$/, '$1')
  const domain = (bare.split('@').pop() ?? '').trim().replace(/\.+$/, '')
  const tld = domain.split('.').pop() ?? ''

  return RESERVED_MAIL_TLDS.includes(tld)
}

export const escapeHtml = (value: string): string => value
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

/** Minor units as a localized amount with its currency (`12,56 €`, `$12.56`). */
export const formatMoney = (amountMinor: number, currency: string, lng: string): string => {
  const digits = fractionDigitsOf(currency)
  const major = amountMinor / 10 ** digits
  try {
    return new Intl.NumberFormat(lng, { style: 'currency', currency: currency.toUpperCase() }).format(major)
  } catch {
    return `${major.toFixed(digits)} ${currency.toUpperCase()}`
  }
}

/** A date and time in UTC, localized (`23 September 2026, 14:05`). */
export const formatDateTime = (at: Date, lng: string): string => {
  try {
    return new Intl.DateTimeFormat(lng, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(at)
  } catch {
    return at.toISOString().replace('T', ' ').slice(0, 16)
  }
}

/** A calendar date in UTC, localized. */
export const formatDate = (at: Date, lng: string): string => {
  try {
    return new Intl.DateTimeFormat(lng, { dateStyle: 'long', timeZone: 'UTC' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/**
 * The last included day of a window whose deadline is EXCLUSIVE (the first instant it is over),
 * as a UTC date — the copy says "until the end of <date>": 13 October 00:00 UTC is "12 October".
 */
export const formatDeadline = (deadline: Date, lng: string): string =>
  formatDate(lastWithdrawalDayOf(deadline), lng)

/** A country's name in a language, else its code. */
export const countryName = (country: string, lng: string): string => {
  try {
    return new Intl.DisplayNames([lng], { type: 'region' }).of(country.toUpperCase()) ?? country
  } catch {
    return country
  }
}
