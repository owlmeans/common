import { isResilientError, ResilientError } from '@owlmeans/error'
import { ConsentKind } from '../consts.js'
import { PerformanceConsentRequired, SubscriptionStartRequired } from '../errors.js'

const MARKERS: Array<[string, ConsentKind]> = [
  ['performance-consent-required', ConsentKind.Performance],
  [PerformanceConsentRequired.typeName, ConsentKind.Performance],
  ['subscription-start-required', ConsentKind.SubscriptionStart],
  [SubscriptionStartRequired.typeName, ConsentKind.SubscriptionStart],
]

/**
 * Which express request a refusal asks for: `performance` (spend consent), `subscription-start`,
 * or `null` for anything else. Recognises the class after `ResilientError.ensure` — a marshaled
 * error that crossed a hop is rebuilt first — and otherwise the marker or type name in the
 * `message` or `type`, so an error wrapped by another layer still answers. A bare HTTP 428 with
 * no marker (a production incident body) is the caller's to check (`@owlmeans/api/status`).
 */
export const consentRefusalOf = (error: unknown): ConsentKind | null => {
  if (error == null || typeof error !== 'object') {
    return null
  }
  let candidate: unknown = error
  if (!isResilientError(error) && error instanceof Error) {
    try {
      candidate = ResilientError.ensure(error)
    } catch {
      candidate = error
    }
  }
  if (candidate instanceof PerformanceConsentRequired) {
    return ConsentKind.Performance
  }
  if (candidate instanceof SubscriptionStartRequired) {
    return ConsentKind.SubscriptionStart
  }
  const { message, type } = error as { message?: unknown, type?: unknown }
  const texts = [message, type].filter((text): text is string => typeof text === 'string')

  return MARKERS.find(([marker]) => texts.some(text => text.includes(marker)))?.[1] ?? null
}
