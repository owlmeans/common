
import { ResilientError } from '@owlmeans/error'
import { AuthForbidden } from '@owlmeans/auth'

export class PaymentError extends ResilientError {
  public static override typeName: string = 'PaymentError'

  constructor(message: string = 'error') {
    super(PaymentError.typeName, `payment:${message}`)
  }
}

export class PaygateError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Paygate`

  constructor(message: string = 'error') {
    super(`paygate:${message}`)
    this.type = PaygateError.typeName
  }
}

export class UnknownPaygate extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownPaygate.typeName
  }
}

export class PaygateMappingError extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}Mapping`

  constructor(message: string = 'error') {
    super(`mapping:${message}`)
    this.type = PaygateMappingError.typeName
  }
}

export class ProductError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Product`

  constructor(message: string = 'error') {
    super(`product:${message}`)
    this.type = ProductError.typeName
  }
}

export class UnknownProduct extends ProductError {
  public static override typeName: string = `${ProductError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownProduct.typeName
  }
}

export class UnknownPlan extends ProductError {
  public static override typeName: string = `${ProductError.typeName}Plan`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownPlan.typeName
  }
}

export class PaymentIdentificationError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Identification`

  constructor(message: string = 'error') {
    super(`identification:${message}`)
    this.type = PaymentIdentificationError.typeName
  }
}

export class SubscriptionError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}Subscription`

  constructor(message: string = 'error') {
    super(`subscription:${message}`)
    this.type = SubscriptionError.typeName
  }
}

export class UnknownSubscription extends SubscriptionError {
  public static override typeName: string = `${SubscriptionError.typeName}Unknown`

  constructor(message: string = 'error') {
    super(`unknown:${message}`)
    this.type = UnknownSubscription.typeName
  }
}

export class LimitUnknown extends ProductError {
  public static override typeName: string = `${ProductError.typeName}LimitUnknown`

  constructor(message: string = 'error') {
    super(`limit-unknown:${message}`)
    this.type = LimitUnknown.typeName
  }
}

export class LimitMisdeclared extends ProductError {
  public static override typeName: string = `${ProductError.typeName}LimitMisdeclared`

  constructor(message: string = 'error') {
    super(`limit-misdeclared:${message}`)
    this.type = LimitMisdeclared.typeName
  }
}

export class PlanRequired extends ProductError {
  public static override typeName: string = `${ProductError.typeName}PlanRequired`

  constructor(message: string = 'error') {
    super(`plan-required:${message}`)
    this.type = PlanRequired.typeName
  }
}

export class PlanRankConflict extends ProductError {
  public static override typeName: string = `${ProductError.typeName}PlanRankConflict`

  constructor(message: string = 'error') {
    super(`plan-rank-conflict:${message}`)
    this.type = PlanRankConflict.typeName
  }
}

export class WebhookSetupError extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}WebhookSetup`

  constructor(message: string = 'error') {
    super(`webhook-setup:${message}`)
    this.type = WebhookSetupError.typeName
  }
}

/**
 * The entity has nothing the requested portal flow can act on — no paygate customer, no entitling
 * subscription, no plan or item to change to. The entity's own state, not a fault: an HTTP boundary
 * that honours `httpStatus` (`@owlmeans/server-api`) answers 409 Conflict.
 */
export class PortalUnavailable extends PaygateError {
  public static override typeName: string = `${PaygateError.typeName}PortalUnavailable`
  public static httpStatus = 409

  constructor(message: string = 'error') {
    super(`portal-unavailable:${message}`)
    this.type = PortalUnavailable.typeName
  }
}

/**
 * The entity's plan does not allow the request.
 *
 * Extends `AuthForbidden` so an HTTP boundary answers 403, never 500. Only `type` and `message`
 * survive a marshal round trip, so each subclass packs its fields into the message and rebuilds
 * them in `finalizeUnmarshal()`.
 */
export class EntitlementRefusal extends AuthForbidden {
  public static override typeName: string = 'EntitlementRefusal'

  constructor(message: string = 'error') {
    super(`entitlement:${message}`)
    this.type = EntitlementRefusal.typeName
  }
}

const CAPABILITY_REQUIRED_MARKER = 'capability-required:'

/** None of the capability parameters (OR'd) is granted. Message marker `capability-required:<a|b>`. */
export class CapabilityRequired extends EntitlementRefusal {
  public static override typeName: string = `${EntitlementRefusal.typeName}CapabilityRequired`

  /** The refused parameters, as the gate took them. */
  public params: string[] = []

  constructor(params: string | string[] = []) {
    const list = (Array.isArray(params) ? params : [params]).filter(param => param !== '')
    super(`${CAPABILITY_REQUIRED_MARKER}${list.join('|')}`)
    this.type = CapabilityRequired.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const at = this.message.indexOf(CAPABILITY_REQUIRED_MARKER)
    const packed = at < 0 ? '' : this.message.slice(at + CAPABILITY_REQUIRED_MARKER.length)
    this.params = packed.split('|').filter(param => param !== '')
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

export interface LimitExhaustedDetails {
  key: string
  used: number
  limit: number
  /** When the window renews. Absent for a limit that never renews. */
  resetsAt?: Date
}

const LIMIT_EXHAUSTED_MARKER = 'limit-exhausted:'
const LIMIT_EXHAUSTED_FIELDS = /^(.*):([^:/]+)\/([^:/]+)(?::(.+))?$/

/**
 * A limit has no room left. Message marker `limit-exhausted:<key>:<used>/<limit>[:<resetsAt ISO>]`.
 */
export class LimitExhausted extends EntitlementRefusal {
  public static override typeName: string = `${EntitlementRefusal.typeName}LimitExhausted`

  public limitKey: string = ''
  public used: number = 0
  public limit: number = 0
  public resetsAt?: Date

  /** The packed marker body of a refusal. */
  static encode(details: LimitExhaustedDetails): string {
    const resetsAt = details.resetsAt != null && !Number.isNaN(details.resetsAt.getTime())
      ? `:${details.resetsAt.toISOString()}` : ''
    return `${details.key}:${details.used}/${details.limit}${resetsAt}`
  }

  constructor(details: LimitExhaustedDetails)
  /** A packed marker body (`LimitExhausted.encode`) or a marshaled message — the error registry's path. */
  constructor(message: string)
  constructor(details: LimitExhaustedDetails | string = 'error') {
    super(`${LIMIT_EXHAUSTED_MARKER}${typeof details === 'string' ? details : LimitExhausted.encode(details)}`)
    this.type = LimitExhausted.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const at = this.message.indexOf(LIMIT_EXHAUSTED_MARKER)
    const match = at < 0 ? null
      : LIMIT_EXHAUSTED_FIELDS.exec(this.message.slice(at + LIMIT_EXHAUSTED_MARKER.length))
    if (match == null) {
      return
    }
    const [, key, used, limit, resetsAt] = match
    this.limitKey = key
    this.used = Number(used) || 0
    this.limit = Number(limit) || 0
    const date = resetsAt != null ? new Date(resetsAt) : null
    this.resetsAt = date != null && !Number.isNaN(date.getTime()) ? date : undefined
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

/**
 * A consumer-rights fault — a misdeclared policy (`policy:<field>`), a missing usage meter or
 * mailer, a copy template without a value (`copy:<path>`). Declares no status: 500.
 */
export class ConsumerRightsError extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}ConsumerRights`

  constructor(message: string = 'error') {
    super(`consumer-rights:${message}`)
    this.type = ConsumerRightsError.typeName
  }
}

/**
 * The consumer's own position refuses the request — never a fault. Deliberately NOT an
 * `AuthForbidden`: an HTTP boundary tests that family first, and a 403 would hide the declared
 * 428/409 a client acts on.
 */
export class ConsumerRightsRefusal extends ConsumerRightsError {
  public static override typeName: string = `${ConsumerRightsError.typeName}Refusal`

  constructor(message: string = 'error') {
    super(message)
    this.type = ConsumerRightsRefusal.typeName
  }
}

/** The packed body after the LAST marker occurrence — a registry rebuild doubles the prefix. */
const packedAfter = (message: string, marker: string): string | null => {
  const at = message.lastIndexOf(marker)

  return at < 0 ? null : message.slice(at + marker.length)
}

const dateOf = (value: string | undefined): Date | undefined => {
  const date = value != null && value !== '' ? new Date(value) : null

  return date != null && !Number.isNaN(date.getTime()) ? date : undefined
}

const isoOf = (date: Date | undefined): string =>
  date != null && !Number.isNaN(date.getTime()) ? `:${date.toISOString()}` : ''

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export interface PerformanceConsentRequiredDetails {
  /** How many open purchases wait for consent. */
  pending: number
  /** The latest of their deadlines. */
  deadline?: Date
}

const PERFORMANCE_CONSENT_MARKER = 'performance-consent-required:'

/**
 * Billed work would spend credits of a purchase still inside its withdrawal window, and the
 * consumer has not expressly requested performance. HTTP 428. Marker
 * `performance-consent-required:<pending>[:<deadline ISO>]`.
 */
export class PerformanceConsentRequired extends ConsumerRightsRefusal {
  public static override typeName: string = `${ConsumerRightsRefusal.typeName}PerformanceConsentRequired`
  public static httpStatus = 428

  public pending: number = 0
  public deadline?: Date

  static encode(details: PerformanceConsentRequiredDetails): string {
    return `${Math.max(0, Math.floor(details.pending))}${isoOf(details.deadline)}`
  }

  constructor(details: PerformanceConsentRequiredDetails)
  /** A packed marker body (`encode`) or a marshaled message — the error registry's path. */
  constructor(message: string)
  constructor(details: PerformanceConsentRequiredDetails | string = 'error') {
    super(`${PERFORMANCE_CONSENT_MARKER}${typeof details === 'string' ? details : PerformanceConsentRequired.encode(details)}`)
    this.type = PerformanceConsentRequired.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const match = /^(\d+)(?::(.+))?$/.exec(packedAfter(this.message, PERFORMANCE_CONSENT_MARKER) ?? '')
    if (match == null) {
      return
    }
    this.pending = Number(match[1])
    this.deadline = dateOf(match[2])
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

const SUBSCRIPTION_START_MARKER = 'subscription-start-required:'

/**
 * A subscription checkout needs a fresh express start request bound to this plan. HTTP 428.
 * Marker `subscription-start-required:<encodeURIComponent(planSku)>`.
 */
export class SubscriptionStartRequired extends ConsumerRightsRefusal {
  public static override typeName: string = `${ConsumerRightsRefusal.typeName}SubscriptionStartRequired`
  public static httpStatus = 428

  public planSku: string = ''

  static encode(planSku: string): string {
    return encodeURIComponent(planSku)
  }

  /** `planSku` as is, or a packed marker body / marshaled message (the registry's path). */
  constructor(planSku: string | { planSku: string } = 'error') {
    super(`${SUBSCRIPTION_START_MARKER}${typeof planSku === 'string' ? SubscriptionStartRequired.encodeLoose(planSku) : SubscriptionStartRequired.encode(planSku.planSku)}`)
    this.type = SubscriptionStartRequired.typeName
    this.applyFields()
  }

  /** A string that already is a marker (the registry path) passes through unencoded. */
  private static encodeLoose(value: string): string {
    return value.includes(SUBSCRIPTION_START_MARKER) ? value : SubscriptionStartRequired.encode(value)
  }

  private applyFields(): void {
    const packed = packedAfter(this.message, SUBSCRIPTION_START_MARKER)
    if (packed != null) {
      this.planSku = decode(packed)
    }
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

export interface BillingCountryLockedDetails {
  /** The locked country. */
  country: string
  /** The country the request declared. */
  requested?: string
}

const BILLING_COUNTRY_LOCKED_MARKER = 'billing-country-locked:'

/**
 * The entity's billing country is fixed and the request declared another. HTTP 409. Marker
 * `billing-country-locked:<country>[:<requested>]`.
 */
export class BillingCountryLocked extends ConsumerRightsRefusal {
  public static override typeName: string = `${ConsumerRightsRefusal.typeName}BillingCountryLocked`
  public static httpStatus = 409

  public country: string = ''
  public requested?: string

  static encode(details: BillingCountryLockedDetails): string {
    return details.requested != null && details.requested !== ''
      ? `${details.country}:${details.requested}` : details.country
  }

  constructor(details: BillingCountryLockedDetails)
  constructor(message: string)
  constructor(details: BillingCountryLockedDetails | string = 'error') {
    super(`${BILLING_COUNTRY_LOCKED_MARKER}${typeof details === 'string' ? details : BillingCountryLocked.encode(details)}`)
    this.type = BillingCountryLocked.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const match = /^([A-Za-z]{2})(?::([A-Za-z]{2}))?$/.exec(packedAfter(this.message, BILLING_COUNTRY_LOCKED_MARKER) ?? '')
    if (match == null) {
      return
    }
    this.country = match[1]
    this.requested = match[2]
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

const WITHDRAWAL_UNAVAILABLE_MARKER = 'withdrawal-unavailable:'

/**
 * The named purchase cannot be withdrawn from (`WithdrawalUnavailableReason`). HTTP 409. Marker
 * `withdrawal-unavailable:<reason>`. Never raised on the public page, which discloses nothing.
 */
export class WithdrawalUnavailable extends ConsumerRightsRefusal {
  public static override typeName: string = `${ConsumerRightsRefusal.typeName}WithdrawalUnavailable`
  public static httpStatus = 409

  public reason: string = ''

  constructor(reason: string = 'error') {
    super(`${WITHDRAWAL_UNAVAILABLE_MARKER}${reason}`)
    this.type = WithdrawalUnavailable.typeName
    this.applyFields()
  }

  private applyFields(): void {
    this.reason = /^[\w-]*/.exec(packedAfter(this.message, WITHDRAWAL_UNAVAILABLE_MARKER) ?? '')?.[0] ?? ''
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

const CANCELLATION_UNAVAILABLE_MARKER = 'cancellation-unavailable:'

/**
 * Nothing to cancel in-app (`CancellationUnavailableReason`). HTTP 409. Marker
 * `cancellation-unavailable:<reason>`.
 */
export class CancellationUnavailable extends ConsumerRightsRefusal {
  public static override typeName: string = `${ConsumerRightsRefusal.typeName}CancellationUnavailable`
  public static httpStatus = 409

  public reason: string = ''

  constructor(reason: string = 'error') {
    super(`${CANCELLATION_UNAVAILABLE_MARKER}${reason}`)
    this.type = CancellationUnavailable.typeName
    this.applyFields()
  }

  private applyFields(): void {
    this.reason = /^[\w-]*/.exec(packedAfter(this.message, CANCELLATION_UNAVAILABLE_MARKER) ?? '')?.[0] ?? ''
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

export interface CheckoutLimitExceededDetails {
  /** The key of the narrowing that set the maximum. */
  reason: string
  /** The narrowed maximum, net minor units — below the policy minimum when nothing may be bought. */
  maximumMinor: number
  currency: string
  resetsAt?: Date
}

const CHECKOUT_LIMIT_MARKER = 'checkout-limit-exceeded:'

/**
 * The amount is above what this entity may buy now (a narrowing of the plan's policy). HTTP 409.
 * Marker `checkout-limit-exceeded:<encodeURIComponent(reason)>:<maximumMinor>:<currency>[:<ISO>]`.
 * A payment refusal, not a consumer-rights one.
 */
export class CheckoutLimitExceeded extends PaymentError {
  public static override typeName: string = `${PaymentError.typeName}CheckoutLimitExceeded`
  public static httpStatus = 409

  public reason: string = ''
  public maximumMinor: number = 0
  public currency: string = ''
  public resetsAt?: Date

  static encode(details: CheckoutLimitExceededDetails): string {
    return `${encodeURIComponent(details.reason)}:${Math.max(0, Math.floor(details.maximumMinor))}`
      + `:${details.currency.toLowerCase()}${isoOf(details.resetsAt)}`
  }

  constructor(details: CheckoutLimitExceededDetails)
  constructor(message: string)
  constructor(details: CheckoutLimitExceededDetails | string = 'error') {
    super(`${CHECKOUT_LIMIT_MARKER}${typeof details === 'string' ? details : CheckoutLimitExceeded.encode(details)}`)
    this.type = CheckoutLimitExceeded.typeName
    this.applyFields()
  }

  private applyFields(): void {
    const match = /^([^:]*):(\d+):([a-z]{3})(?::(.+))?$/.exec(packedAfter(this.message, CHECKOUT_LIMIT_MARKER) ?? '')
    if (match == null) {
      return
    }
    this.reason = decode(match[1])
    this.maximumMinor = Number(match[2])
    this.currency = match[3]
    this.resetsAt = dateOf(match[4])
  }

  override finalizeUnmarshal(): void {
    this.applyFields()
  }
}

ResilientError.registerErrorClass(PaymentError)
ResilientError.registerErrorClass(PaygateError)
ResilientError.registerErrorClass(UnknownPaygate)
ResilientError.registerErrorClass(PaygateMappingError)
ResilientError.registerErrorClass(ProductError)
ResilientError.registerErrorClass(UnknownProduct)
ResilientError.registerErrorClass(UnknownPlan)
ResilientError.registerErrorClass(PaymentIdentificationError)
ResilientError.registerErrorClass(SubscriptionError)
ResilientError.registerErrorClass(UnknownSubscription)
ResilientError.registerErrorClass(LimitUnknown)
ResilientError.registerErrorClass(LimitMisdeclared)
ResilientError.registerErrorClass(PlanRequired)
ResilientError.registerErrorClass(PlanRankConflict)
ResilientError.registerErrorClass(WebhookSetupError)
ResilientError.registerErrorClass(PortalUnavailable)
ResilientError.registerErrorClass(EntitlementRefusal)
ResilientError.registerErrorClass(CapabilityRequired)
ResilientError.registerErrorClass(LimitExhausted)
ResilientError.registerErrorClass(ConsumerRightsError)
ResilientError.registerErrorClass(ConsumerRightsRefusal)
ResilientError.registerErrorClass(PerformanceConsentRequired)
ResilientError.registerErrorClass(SubscriptionStartRequired)
ResilientError.registerErrorClass(BillingCountryLocked)
ResilientError.registerErrorClass(WithdrawalUnavailable)
ResilientError.registerErrorClass(CancellationUnavailable)
ResilientError.registerErrorClass(CheckoutLimitExceeded)
