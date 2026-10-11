import type { ConsumerRightsMechanisms, ConsumerRightsPolicy } from '../types.js'
import { CONSUMER_RIGHTS_TERRITORIES } from '../consts.js'

export const DAY_MS = 86_400_000

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

export const CONSUMER_RIGHTS_API_PATH = '/consumer-rights'

export const CONSUMER_RIGHTS_PUBLIC_PATH = '/public/consumer-rights'

export const CONSUMER_RIGHTS_WITHDRAWAL_SCREEN_PATH = '/legal/withdraw'

export const CONSUMER_RIGHTS_CANCELLATION_SCREEN_PATH = '/legal/cancel'
