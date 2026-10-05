import { ConsumerRightsError } from '../errors.js'
import type { ConsumerRightsLinks, ConsumerRightsPolicy } from '../types.js'
import { CONSENT_CONTEXT, COUNTRY, CURRENCY } from './consts.local.js'
import { DEFAULT_CONSUMER_RIGHTS } from './consts.js'
import type { ConsumerRightsDeclaration } from './types.js'
import type { ConsumerRightsPolicyHelper } from './policy/types.js'

/**
 * A declaration filled with `DEFAULT_CONSUMER_RIGHTS` and asserted. Only the policy's own fields are
 * copied — anything else on `def` (a server's mail options) never reaches the advertised record.
 */
export const makeConsumerRightsPolicy = (def: ConsumerRightsDeclaration): ConsumerRightsPolicy => {
  const defaults = DEFAULT_CONSUMER_RIGHTS
  const present = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
    (value == null ? {} : { [key]: value }) as { [P in K]?: V }

  return consumerRightsPolicyHelper.assertConsumerRightsPolicy({
    textVersion: def.textVersion,
    countries: [...(def.countries ?? defaults.countries)].map(country => country.toUpperCase()),
    unknownCountry: def.unknownCountry ?? defaults.unknownCountry,
    withdrawalDays: def.withdrawalDays ?? defaults.withdrawalDays,
    deadline: { ...defaults.deadline, ...def.deadline },
    mechanisms: { ...defaults.mechanisms, ...def.mechanisms },
    ...present('currencies', def.currencies),
    ...present('languages', def.languages),
    defaultLanguage: def.defaultLanguage ?? defaults.defaultLanguage,
    links: def.links,
    ...present('renewalOpensWindow', def.renewalOpensWindow ?? defaults.renewalOpensWindow),
    ...present('startRequestTtlSeconds', def.startRequestTtlSeconds ?? defaults.startRequestTtlSeconds),
    ...present('exemptBusinesses', def.exemptBusinesses ?? defaults.exemptBusinesses),
    ...present('consentContext', def.consentContext),
  })
}

export const createConsumerRightsPolicyHelper = (): ConsumerRightsPolicyHelper => {
  const isHttpsUrl = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false
    }
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }

  const fail = (field: string): never => {
    throw new ConsumerRightsError(`policy:${field}`)
  }

  const assertConsumerRightsPolicy = (policy: ConsumerRightsPolicy): ConsumerRightsPolicy => {
    if (typeof policy.textVersion !== 'string' || policy.textVersion.trim() === '') fail('text-version')
    if (policy.mechanisms == null || typeof policy.mechanisms !== 'object') fail('mechanisms')
    if (!Array.isArray(policy.countries) || policy.countries.some(country => !COUNTRY.test(country))) fail('countries')
    if (policy.unknownCountry !== 'protect' && policy.unknownCountry !== 'ignore') fail('unknown-country')
    if (!Number.isSafeInteger(policy.withdrawalDays) || policy.withdrawalDays < 14) fail('withdrawal-days')
    const margin = policy.deadline?.marginDays ?? -1
    if (!Number.isSafeInteger(margin) || margin < 0 || margin > 7) fail('margin-days')
    if (Object.values(policy.currencies ?? {}).some(currency => !CURRENCY.test(currency ?? ''))) fail('currencies')
    if (policy.startRequestTtlSeconds != null
      && (!Number.isSafeInteger(policy.startRequestTtlSeconds) || policy.startRequestTtlSeconds < 1)) fail('start-request-ttl')
    if (policy.consentContext != null && !CONSENT_CONTEXT.test(policy.consentContext)) fail('consent-context')

    const defaults = policy.links?.[policy.defaultLanguage]
    if (defaults == null || !isHttpsUrl(defaults.billingTerms)) fail('links')
    for (const [lng, links] of Object.entries(policy.links)) {
      if (Object.values(links).some(url => url != null && !isHttpsUrl(url))) fail(`links:${lng}`)
    }
    if ((policy.mechanisms.withdrawal || policy.mechanisms.performanceConsent) && defaults!.withdrawalInformation == null) {
      fail('links:withdrawal-information')
    }

    return policy
  }

  const baseLanguageOf = (lng: string | null | undefined): string =>
    (lng ?? '').trim().split(/[-_]/)[0].toLowerCase()

  const linksOf = (policy: Pick<ConsumerRightsPolicy, 'links' | 'defaultLanguage'>, lng?: string | null): ConsumerRightsLinks => {
    const fallback = policy.links[policy.defaultLanguage]
    const own = lng != null ? policy.links[lng] ?? policy.links[baseLanguageOf(lng)] : undefined

    return { ...fallback, ...Object.fromEntries(Object.entries(own ?? {}).filter(([, url]) => url != null)) } as ConsumerRightsLinks
  }

  return { assertConsumerRightsPolicy, baseLanguageOf, linksOf }
}

export const consumerRightsPolicyHelper = createConsumerRightsPolicyHelper()

/** @deprecated compat:factory-refactor — use `consumerRightsPolicyHelper.assertConsumerRightsPolicy(…)` */
export const assertConsumerRightsPolicy = (policy: ConsumerRightsPolicy): ConsumerRightsPolicy =>
  consumerRightsPolicyHelper.assertConsumerRightsPolicy(policy)

/** @deprecated compat:factory-refactor — use `consumerRightsPolicyHelper.baseLanguageOf(…)` */
export const baseLanguageOf = (lng: string | null | undefined): string => consumerRightsPolicyHelper.baseLanguageOf(lng)

/** @deprecated compat:factory-refactor — use `consumerRightsPolicyHelper.linksOf(…)` */
export const linksOf = (
  policy: Pick<ConsumerRightsPolicy, 'links' | 'defaultLanguage'>, lng?: string | null,
): ConsumerRightsLinks => consumerRightsPolicyHelper.linksOf(policy, lng)
