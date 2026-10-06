import { ConsentKind } from '../consts.js'
import { PerformanceConsentRequired, SubscriptionStartRequired } from '../errors.js'

export const COUNTRY = /^[A-Z]{2}$/

export const CURRENCY = /^[a-z]{3}$/

export const CONSENT_CONTEXT = /^[a-z][a-z0-9-]{0,63}$/

/** The marker or type name a refusal of each express request carries in its message or type. */
export const CONSENT_REFUSAL_MARKERS: Array<[string, ConsentKind]> = [
  ['performance-consent-required', ConsentKind.Performance],
  [PerformanceConsentRequired.typeName, ConsentKind.Performance],
  ['subscription-start-required', ConsentKind.SubscriptionStart],
  [SubscriptionStartRequired.typeName, ConsentKind.SubscriptionStart],
]
