import type { ConsumerRightsLinks, ConsumerRightsPolicy } from '../../types.js'

/** The consumer-rights policy's invariants, its languages and its links. */
export interface ConsumerRightsPolicyHelper {
  /**
   * @throws ConsumerRightsError (`policy:<field>`) when the text version is empty, a country or a
   * currency is malformed, the period is shorter than 14 days, the margin is outside 0..7 days, the
   * consent context is not a lowercase key, the default language has no links, a link is not an
   * absolute https URL, or the withdrawal information is missing while the withdrawal function or the
   * performance consent is on.
   */
  assertConsumerRightsPolicy: (policy: ConsumerRightsPolicy) => ConsumerRightsPolicy
  /** `de-DE` → `de`. */
  baseLanguageOf: (lng: string | null | undefined) => string
  /**
   * The links of one language, field by field over the default language's — a language that only
   * translates the Billing Terms still points at the default withdrawal information.
   */
  linksOf: (policy: Pick<ConsumerRightsPolicy, 'links' | 'defaultLanguage'>, lng?: string | null) => ConsumerRightsLinks
}
