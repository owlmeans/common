import type { JSONSchemaType } from 'ajv'

export enum ProductType {
  Simple = 'simple',
  Service = 'service',
  Consumable = 'consumable'
}

export enum CheckoutPricingMode {
  Quantity = 'quantity',
  Amount = 'amount',
}

export enum PaymentEntityType {
  Product = 'product',
  Plan = 'plan',
  CapabilitySet = 'capability-set',
}

export enum PlanStatus {
  Active = 'active',
  Custom = 'custom',
  Hidden = 'hidden',
  Archived = 'archived',
  Deprecated = 'deprecated',
  Suspended = 'suspended'
}

export enum PlanDuration {
  Monthly = 'monthly',
  Yearly = 'yearly',
  Lifetime = 'lifetime',
  Reusable = 'reusable',
  /**
   * It means it requires some tokens to be consumed to use the 
   * capability.
   */
  Consumable = 'consumable'
}

export enum SubscriptionStatus {
  Created = 'created',
  Trial = 'trial',
  Canceled = 'canceled',
  Expired = 'expired',
  /** Revoked until resumed: unpaid, paused, or collection paused. */
  Suspended = 'suspended',
  Blocked = 'blocked',
  Ended = 'ended',
  Active = 'active',
  /** Payment failed and is being retried: still entitled, flagged. */
  PastDue = 'past-due',
}

/** The statuses that grant a plan's capabilities and limits. */
export const ENTITLING_STATUSES: readonly SubscriptionStatus[] = Object.freeze([
  SubscriptionStatus.Active, SubscriptionStatus.Trial, SubscriptionStatus.PastDue,
])

/** The statuses a subscription never leaves on its own. */
export const TERMINAL_STATUSES: readonly SubscriptionStatus[] = Object.freeze([
  SubscriptionStatus.Canceled, SubscriptionStatus.Expired, SubscriptionStatus.Ended,
  SubscriptionStatus.Blocked,
])

/** How a limit's counter renews. */
export enum LimitKind {
  /** Renews on a calendar UTC window (`LimitWindow`). */
  Window = 'window',
  /** Never renews: the counter belongs to the entity and survives plan changes. */
  Lifetime = 'lifetime',
  /** A held count (`+1` on acquire, `-1` on release), reconciled against reality. */
  Occupancy = 'occupancy',
}

/** The calendar UTC window of a `LimitKind.Window` limit. */
export enum LimitWindow {
  Day = 'day',
  Month = 'month',
}

/** Which paygate portal flow a portal link opens. */
export enum PortalFlow {
  Manage = 'manage',
  Cancel = 'cancel',
  Update = 'update',
  Change = 'change',
  PaymentMethod = 'payment-method',
}

/** The paygate alias of subscriptions the application grants itself (a free plan, a comp). */
export const INTERNAL_PAYGATE = 'internal'

export const ProductTypeSchema: JSONSchemaType<ProductType> = {
  type: 'string',
  enum: Object.values(ProductType)
}

export const CheckoutPricingModeSchema: JSONSchemaType<CheckoutPricingMode> = {
  type: 'string',
  enum: Object.values(CheckoutPricingMode),
}

export const PaymentEntityTypeSchema: JSONSchemaType<PaymentEntityType> = {
  type: 'string',
  enum: Object.values(PaymentEntityType)
}

export const PlanStatusSchema: JSONSchemaType<PlanStatus> = {
  type: 'string',
  enum: Object.values(PlanStatus)
}

export const PlanDurationSchema: JSONSchemaType<PlanDuration> = {
  type: 'string',
  enum: Object.values(PlanDuration)
}

export const SubscriptionStatusSchema: JSONSchemaType<SubscriptionStatus> = {
  type: 'string',
  enum: Object.values(SubscriptionStatus)
}

export const LimitKindSchema: JSONSchemaType<LimitKind> = {
  type: 'string',
  enum: Object.values(LimitKind)
}

export const LimitWindowSchema: JSONSchemaType<LimitWindow> = {
  type: 'string',
  enum: Object.values(LimitWindow)
}

export const PortalFlowSchema: JSONSchemaType<PortalFlow> = {
  type: 'string',
  enum: Object.values(PortalFlow)
}

export const ProductTitleSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 1, maxLength: 128
}

export const ProductDescriptionSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 0, maxLength: 1024, nullable: true
}

export const LocalizationLngSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 2, maxLength: 3
}

export const PRODUCT_RECORD_TYPE = 'product'
export const PRODUCT_RECORD_PREFIX = PRODUCT_RECORD_TYPE

export const PLAN_RECORD_TYPE = 'plan'
export const PLAN_RECORD_PREFIX = PLAN_RECORD_TYPE

export const L10N_RECORD_TYPE = 'l10n'
export const L10N_RECORD_PREFIX = L10N_RECORD_TYPE

export const DEFAULT_ALIAS = 'payment'

export const PAYMENT_SERVICE = DEFAULT_ALIAS
