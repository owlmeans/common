import { ConsumerRightsError } from '../errors.js'
import { CONSUMER_RIGHTS_TERRITORIES } from '../regions.js'
import type { ConsumerRightsLinks, ConsumerRightsMechanisms, ConsumerRightsPolicy } from '../types.js'

/** Every mechanism off: declaring a policy changes nothing until the application switches one on. */
export const NO_CONSUMER_RIGHTS_MECHANISMS: ConsumerRightsMechanisms = Object.freeze({
  countryLock: false,
  checkoutTerms: false,
  performanceConsent: false,
  subscriptionStart: false,
  withdrawal: false,
  automaticRefunds: false,
  cancellation: false,
  purchaseConfirmation: false,
})

/**
 * What a declaration leaves out: the EU and EEA territories, an unknown country protected, 14 days
 * ending at the end of a UTC day, a weekend end moved to Monday, five margin days, every mechanism
 * off, English as the default language, start requests usable for an hour.
 *
 * Five margin days because a period ending on a public holiday runs to the next working day (EU
 * Reg. 1182/71 art. 3(4)) and holiday clusters (24–26 December plus a weekend, Maundy Thursday to
 * Easter Monday) need up to five; no per-country holiday calendar is kept, so a generous margin
 * keeps the withdrawal function open for the whole statutory period everywhere.
 */
export const DEFAULT_CONSUMER_RIGHTS: Readonly<Omit<ConsumerRightsPolicy, 'textVersion' | 'links'>> = Object.freeze({
  countries: [...CONSUMER_RIGHTS_TERRITORIES],
  unknownCountry: 'protect',
  withdrawalDays: 14,
  deadline: Object.freeze({ weekendRollover: true, marginDays: 5 }),
  mechanisms: NO_CONSUMER_RIGHTS_MECHANISMS,
  defaultLanguage: 'en',
  renewalOpensWindow: false,
  startRequestTtlSeconds: 3600,
  exemptBusinesses: false,
})

/** What an application must state itself; everything else defaults. */
export type ConsumerRightsDeclaration = Partial<Omit<ConsumerRightsPolicy, 'mechanisms' | 'deadline'>>
  & Pick<ConsumerRightsPolicy, 'textVersion' | 'links'>
  & { mechanisms?: Partial<ConsumerRightsMechanisms>, deadline?: Partial<ConsumerRightsPolicy['deadline']> }

/**
 * A declaration filled with `DEFAULT_CONSUMER_RIGHTS` and asserted. Only the policy's own fields are
 * copied — anything else on `def` (a server's mail options) never reaches the advertised record.
 */
export const makeConsumerRightsPolicy = (def: ConsumerRightsDeclaration): ConsumerRightsPolicy => {
  const defaults = DEFAULT_CONSUMER_RIGHTS
  const present = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
    (value == null ? {} : { [key]: value }) as { [P in K]?: V }

  return assertConsumerRightsPolicy({
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
  })
}

const COUNTRY = /^[A-Z]{2}$/
const CURRENCY = /^[a-z]{3}$/

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

/**
 * @throws ConsumerRightsError (`policy:<field>`) when the text version is empty, a country or a
 * currency is malformed, the period is shorter than 14 days, the margin is outside 0..7 days, the
 * default language has no links, a link is not an absolute https URL, or the withdrawal information
 * is missing while the withdrawal function or the performance consent is on.
 */
export const assertConsumerRightsPolicy = (policy: ConsumerRightsPolicy): ConsumerRightsPolicy => {
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

/** `de-DE` → `de`. */
export const baseLanguageOf = (lng: string | null | undefined): string =>
  (lng ?? '').trim().split(/[-_]/)[0].toLowerCase()

/**
 * The links of one language, field by field over the default language's — a language that only
 * translates the Billing Terms still points at the default withdrawal information.
 */
export const linksOf = (policy: Pick<ConsumerRightsPolicy, 'links' | 'defaultLanguage'>, lng?: string | null): ConsumerRightsLinks => {
  const fallback = policy.links[policy.defaultLanguage]
  const own = lng != null ? policy.links[lng] ?? policy.links[baseLanguageOf(lng)] : undefined

  return { ...fallback, ...Object.fromEntries(Object.entries(own ?? {}).filter(([, url]) => url != null)) } as ConsumerRightsLinks
}
