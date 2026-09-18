
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
