import { COUNTRY_CURRENCIES } from './consts.js'

/** The lowercase ISO 4217 currency of a country, or `null` when this map has no entry for it. */
export const currencyOfCountry = (country: string): string | null =>
  COUNTRY_CURRENCIES[country.toUpperCase()] ?? null
