import type { ConsumerRegion } from '../consts.js'
import type { ConsumerRightsPolicy } from '../types.js'
import type { RegionPolicy } from '../types.local.js'

/** The consumer region of a billing country and what it decides: scope, currency and legal language. */
export interface ConsumerRegionHelper {
  /** A member state of the EU (not a territory with its own code). */
  isEuCountry: (country: string | null | undefined) => boolean
  /** A member state of the EEA: the EU's 27 plus Iceland, Liechtenstein and Norway. */
  isEeaCountry: (country: string | null | undefined) => boolean
  /**
   * The consumer region of a billing country: `Eu` inside the policy's territories (the default
   * ones without a policy), `Other` outside, `null` when the country is unknown.
   */
  regionOf: (country: string | null | undefined, policy?: RegionPolicy) => ConsumerRegion | null
  /**
   * Whether a buyer has the consumer rights: a known country decides by the policy's territories;
   * without one, a known region decides; with neither, `unknownCountry: 'protect'` (the default) puts
   * the buyer in scope — the safe side.
   */
  inScope: (
    region: ConsumerRegion | null | undefined, country: string | null | undefined,
    policy?: Pick<ConsumerRightsPolicy, 'countries' | 'unknownCountry'> | null,
  ) => boolean
  /**
   * The currency a region is charged in (lowercase ISO 4217): the policy's currency for the region,
   * an unknown region reading as `Eu`; `fallback` when the policy names none.
   */
  chargeCurrencyOf: (
    region: ConsumerRegion | null | undefined, policy: Pick<ConsumerRightsPolicy, 'currencies'> | null | undefined,
    fallback: string,
  ) => string
  /**
   * The language of a billing country's legal copy: the policy's own map, then
   * `COUNTRY_LANGUAGES`, then `fallback`, then the policy's default language, then `en`.
   */
  billingLanguageOf: (
    country: string | null | undefined,
    policy?: Pick<ConsumerRightsPolicy, 'languages' | 'defaultLanguage'> | null,
    fallback?: string,
  ) => string
}
