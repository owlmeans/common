import { ConsumerRegion, CONSUMER_RIGHTS_TERRITORIES, COUNTRY_LANGUAGES, EEA_EXTRA, EU_COUNTRIES } from './consts.js'
import type { ConsumerRightsPolicy } from './types.js'
import type { RegionPolicy } from './types.local.js'
import type { ConsumerRegionHelper } from './regions/types.js'

const codeOf = (country: string | null | undefined): string | null =>
  country == null || country.trim() === '' ? null : country.trim().toUpperCase()

export const createConsumerRegionHelper = (): ConsumerRegionHelper => {
  const isEuCountry = (country: string | null | undefined): boolean =>
    EU_COUNTRIES.includes(codeOf(country) ?? '')

  const isEeaCountry = (country: string | null | undefined): boolean => {
    const code = codeOf(country) ?? ''

    return EU_COUNTRIES.includes(code) || EEA_EXTRA.includes(code)
  }

  const regionOf = (country: string | null | undefined, policy?: RegionPolicy): ConsumerRegion | null => {
    const code = codeOf(country)
    if (code == null) {
      return null
    }

    return (policy?.countries ?? CONSUMER_RIGHTS_TERRITORIES).includes(code) ? ConsumerRegion.Eu : ConsumerRegion.Other
  }

  const inScope = (
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

  const chargeCurrencyOf = (
    region: ConsumerRegion | null | undefined, policy: Pick<ConsumerRightsPolicy, 'currencies'> | null | undefined,
    fallback: string,
  ): string => (policy?.currencies?.[region ?? ConsumerRegion.Eu] ?? fallback).toLowerCase()

  const billingLanguageOf = (
    country: string | null | undefined,
    policy?: Pick<ConsumerRightsPolicy, 'languages' | 'defaultLanguage'> | null,
    fallback?: string,
  ): string => {
    const code = codeOf(country)
    const mapped = code == null ? undefined : policy?.languages?.[code] ?? COUNTRY_LANGUAGES[code]

    return mapped ?? fallback ?? policy?.defaultLanguage ?? 'en'
  }

  return { isEuCountry, isEeaCountry, regionOf, inScope, chargeCurrencyOf, billingLanguageOf }
}

export const consumerRegionHelper = createConsumerRegionHelper()

/** @deprecated compat:factory-refactor — use `consumerRegionHelper.regionOf(…)` */
export const regionOf = (country: string | null | undefined, policy?: RegionPolicy): ConsumerRegion | null =>
  consumerRegionHelper.regionOf(country, policy)

/** @deprecated compat:factory-refactor — use `consumerRegionHelper.inScope(…)` */
export const inScope = (
  region: ConsumerRegion | null | undefined, country: string | null | undefined,
  policy?: Pick<ConsumerRightsPolicy, 'countries' | 'unknownCountry'> | null,
): boolean => consumerRegionHelper.inScope(region, country, policy)

/** @deprecated compat:factory-refactor — use `consumerRegionHelper.chargeCurrencyOf(…)` */
export const chargeCurrencyOf = (
  region: ConsumerRegion | null | undefined, policy: Pick<ConsumerRightsPolicy, 'currencies'> | null | undefined,
  fallback: string,
): string => consumerRegionHelper.chargeCurrencyOf(region, policy, fallback)

/** @deprecated compat:factory-refactor — use `consumerRegionHelper.billingLanguageOf(…)` */
export const billingLanguageOf = (
  country: string | null | undefined,
  policy?: Pick<ConsumerRightsPolicy, 'languages' | 'defaultLanguage'> | null,
  fallback?: string,
): string => consumerRegionHelper.billingLanguageOf(country, policy, fallback)
