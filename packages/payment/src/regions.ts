import { ConsumerRegion } from './consts.js'
import type { ConsumerRightsPolicy } from './types.js'

/** The 27 EU member states (ISO 3166-1 alpha-2; Greece is `GR`, as Stripe reports it). */
export const EU_COUNTRIES: readonly string[] = Object.freeze([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
])

/**
 * The member states plus the parts of them that carry their own ISO code — Åland (FI) and the
 * French outermost regions (French Guiana, Guadeloupe, Martinique, Réunion, Mayotte, Saint-Martin).
 * EU consumer law applies there even where EU VAT does not; the Canary Islands, Azores and Madeira
 * share their state's code. Scope beyond the member states is a question for the lawyer.
 */
export const EU_CONSUMER_TERRITORIES: readonly string[] = Object.freeze([
  ...EU_COUNTRIES, 'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
])

/** The EEA members outside the EU. */
export const EEA_EXTRA: readonly string[] = Object.freeze(['IS', 'LI', 'NO'])

/** The territories whose consumers have the right of withdrawal by default: the EU's and the EEA's. */
export const CONSUMER_RIGHTS_TERRITORIES: readonly string[] = Object.freeze([
  ...EU_CONSUMER_TERRITORIES, ...EEA_EXTRA,
])

/**
 * Country → the language of its legal copy, only where that is unambiguous (Belgium, Luxembourg,
 * Switzerland, Canada … are absent and fall back to the policy's default). An application widens
 * or overrides it with `ConsumerRightsPolicy.languages`.
 */
export const COUNTRY_LANGUAGES: Readonly<Record<string, string>> = Object.freeze({
  DE: 'de', AT: 'de', LI: 'de',
  FR: 'fr', GF: 'fr', GP: 'fr', MQ: 'fr', RE: 'fr', YT: 'fr', MF: 'fr', MC: 'fr',
  PL: 'pl',
  ES: 'es',
  IE: 'en', MT: 'en', GB: 'en', US: 'en', AU: 'en', NZ: 'en',
  UA: 'uk',
  BY: 'be',
  RU: 'ru',
})

const codeOf = (country: string | null | undefined): string | null =>
  country == null || country.trim() === '' ? null : country.trim().toUpperCase()

/** A member state of the EU (not a territory with its own code). */
export const isEuCountry = (country: string | null | undefined): boolean =>
  EU_COUNTRIES.includes(codeOf(country) ?? '')

/** A member state of the EEA: the EU's 27 plus Iceland, Liechtenstein and Norway. */
export const isEeaCountry = (country: string | null | undefined): boolean => {
  const code = codeOf(country) ?? ''

  return EU_COUNTRIES.includes(code) || EEA_EXTRA.includes(code)
}

type RegionPolicy = Pick<ConsumerRightsPolicy, 'countries'> | null | undefined

/**
 * The consumer region of a billing country: `Eu` inside the policy's territories (the default
 * ones without a policy), `Other` outside, `null` when the country is unknown.
 */
export const regionOf = (country: string | null | undefined, policy?: RegionPolicy): ConsumerRegion | null => {
  const code = codeOf(country)
  if (code == null) {
    return null
  }

  return (policy?.countries ?? CONSUMER_RIGHTS_TERRITORIES).includes(code) ? ConsumerRegion.Eu : ConsumerRegion.Other
}

/**
 * Whether a buyer has the consumer rights: a known country decides by the policy's territories;
 * without one, a known region decides; with neither, `unknownCountry: 'protect'` (the default) puts
 * the buyer in scope — the safe side.
 */
export const inScope = (
  region: ConsumerRegion | null | undefined, country: string | null | undefined,
  policy?: Pick<ConsumerRightsPolicy, 'countries' | 'unknownCountry'> | null,
): boolean => {
  const code = codeOf(country)
  if (code != null) {
    return (policy?.countries ?? CONSUMER_RIGHTS_TERRITORIES).includes(code)
  }
  if (region != null) {
    return region === ConsumerRegion.Eu
  }

  return (policy?.unknownCountry ?? 'protect') === 'protect'
}

/**
 * The currency a region is charged in (lowercase ISO 4217): the policy's currency for the region,
 * an unknown region reading as `Eu`; `fallback` when the policy names none.
 */
export const chargeCurrencyOf = (
  region: ConsumerRegion | null | undefined, policy: Pick<ConsumerRightsPolicy, 'currencies'> | null | undefined,
  fallback: string,
): string => (policy?.currencies?.[region ?? ConsumerRegion.Eu] ?? fallback).toLowerCase()

/**
 * The language of a billing country's legal copy: the policy's own map, then
 * `COUNTRY_LANGUAGES`, then `fallback`, then the policy's default language, then `en`.
 */
export const billingLanguageOf = (
  country: string | null | undefined,
  policy?: Pick<ConsumerRightsPolicy, 'languages' | 'defaultLanguage'> | null,
  fallback?: string,
): string => {
  const code = codeOf(country)
  const mapped = code == null ? undefined : policy?.languages?.[code] ?? COUNTRY_LANGUAGES[code]

  return mapped ?? fallback ?? policy?.defaultLanguage ?? 'en'
}
