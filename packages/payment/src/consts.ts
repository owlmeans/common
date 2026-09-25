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

/** Whether a price's amount includes tax, or tax is added on top — never inferred, always declared. */
export enum TaxBehavior {
  Exclusive = 'exclusive',
  Inclusive = 'inclusive',
}

/** What a price estimate says about tax at one billing country. */
export enum TaxEstimateStatus {
  /** Tax is due and its rate(s) are in `TaxEstimate.rates`. */
  Taxed = 'taxed',
  /** No tax because the buyer's tax id shifts liability to them (EU/GB reverse charge). */
  ReverseCharge = 'reverse-charge',
  /** No tax for any other reason (not registered there, exempt, zero-rated). */
  None = 'none',
  /** The gateway could not resolve a rate from what it was given; the real total shows at checkout. */
  AtCheckout = 'at-checkout',
  /** No country was given and none could be inferred from the entity's paygate customer. */
  LocationRequired = 'location-required',
}

/** A tax type a rate carries, collapsed from Stripe's finer `tax_type` for display. */
export enum TaxType {
  Vat = 'vat',
  Gst = 'gst',
  SalesTax = 'sales-tax',
  /** Any other Stripe `tax_type` (excise, lease, tourism, …). */
  Tax = 'tax',
}

/** The paygate alias of subscriptions the application grants itself (a free plan, a comp). */
export const INTERNAL_PAYGATE = 'internal'

/**
 * Where a billing country sits for consumer rights and the charge currency: inside the declared
 * consumer-rights territories (`ConsumerRightsPolicy.countries`) or outside them.
 */
export enum ConsumerRegion {
  Eu = 'eu',
  Other = 'other',
}

/** What a purchase — a window of the right of withdrawal — was. */
export enum PurchaseKind {
  /** A paid one-time checkout of an amount or quantity plan (prepaid credits). */
  TopUp = 'top-up',
  /** The FIRST invoice of a subscription. Renewals are not purchases. */
  Subscription = 'subscription',
}

/** What a consumer expressly requested. */
export enum ConsentKind {
  /** Start performing now, before the withdrawal period of a credit purchase ends. */
  Performance = 'performance',
  /** Start a subscription's services now — given before its checkout. */
  SubscriptionStart = 'subscription-start',
}

/** What a consumer declared through a statutory function. */
export enum DeclarationKind {
  Withdrawal = 'withdrawal',
  Cancellation = 'cancellation',
}

/** Where a declaration was made: signed in, or through the public page without a login. */
export enum DeclarationChannel {
  InApp = 'in-app',
  Public = 'public',
}

export enum CancellationKind {
  Ordinary = 'ordinary',
  /** For cause; carries a reason. */
  Extraordinary = 'extraordinary',
}

export enum WithdrawalStatus {
  /** Recorded; nothing is disclosed yet (a public declaration always answers this). */
  Received = 'received',
  Processing = 'processing',
  Refunded = 'refunded',
  /** Recorded, and left to an operator: no usage meter, or automatic refunds are off. */
  Review = 'review',
  Failed = 'failed',
  /** Received after the withdrawal period ended; recorded, not executed. */
  Expired = 'expired',
}

export enum CancellationStatus {
  Received = 'received',
  Scheduled = 'scheduled',
  AlreadyScheduled = 'already-scheduled',
  /** Recorded and left to an operator — an extraordinary cancellation (for cause). */
  Review = 'review',
}

export enum WithdrawalUnavailableReason {
  NotInScope = 'not-in-scope',
  Expired = 'expired',
  Withdrawn = 'withdrawn',
  /** Fully performed after consent: the right of withdrawal has expired, nothing would be reimbursed. */
  Performed = 'performed',
  Unknown = 'unknown',
}

export enum CancellationUnavailableReason {
  NoSubscription = 'no-subscription',
  Ended = 'ended',
}

export const ConsumerRegionSchema: JSONSchemaType<ConsumerRegion> = {
  type: 'string',
  enum: Object.values(ConsumerRegion),
}

export const PurchaseKindSchema: JSONSchemaType<PurchaseKind> = {
  type: 'string',
  enum: Object.values(PurchaseKind),
}

export const ConsentKindSchema: JSONSchemaType<ConsentKind> = {
  type: 'string',
  enum: Object.values(ConsentKind),
}

export const DeclarationKindSchema: JSONSchemaType<DeclarationKind> = {
  type: 'string',
  enum: Object.values(DeclarationKind),
}

export const DeclarationChannelSchema: JSONSchemaType<DeclarationChannel> = {
  type: 'string',
  enum: Object.values(DeclarationChannel),
}

export const CancellationKindSchema: JSONSchemaType<CancellationKind> = {
  type: 'string',
  enum: Object.values(CancellationKind),
}

export const WithdrawalStatusSchema: JSONSchemaType<WithdrawalStatus> = {
  type: 'string',
  enum: Object.values(WithdrawalStatus),
}

export const CancellationStatusSchema: JSONSchemaType<CancellationStatus> = {
  type: 'string',
  enum: Object.values(CancellationStatus),
}

export const WithdrawalUnavailableReasonSchema: JSONSchemaType<WithdrawalUnavailableReason> = {
  type: 'string',
  enum: Object.values(WithdrawalUnavailableReason),
}

export const CancellationUnavailableReasonSchema: JSONSchemaType<CancellationUnavailableReason> = {
  type: 'string',
  enum: Object.values(CancellationUnavailableReason),
}

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

export const TaxBehaviorSchema: JSONSchemaType<TaxBehavior> = {
  type: 'string',
  enum: Object.values(TaxBehavior)
}

export const TaxEstimateStatusSchema: JSONSchemaType<TaxEstimateStatus> = {
  type: 'string',
  enum: Object.values(TaxEstimateStatus)
}

export const TaxTypeSchema: JSONSchemaType<TaxType> = {
  type: 'string',
  enum: Object.values(TaxType)
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

/** A singleton record: at most one per configuration, at this fixed id. */
export const PRICING_POLICY_RECORD_TYPE = 'pricing-policy'
export const PRICING_POLICY_RECORD_ID = PRICING_POLICY_RECORD_TYPE

/** A singleton record: the declared `ConsumerRightsPolicy`, at this fixed id. */
export const CONSUMER_RIGHTS_RECORD_TYPE = 'consumer-rights-policy'
export const CONSUMER_RIGHTS_RECORD_ID = CONSUMER_RIGHTS_RECORD_TYPE

/** The i18n resource (library tier, `lib` namespace) holding the consumer-rights legal copy. */
export const CONSUMER_RIGHTS_RESOURCE = 'payment-consumer-rights'

/**
 * The version of the legal copy this package ships. Bumped on ANY change to a
 * `payment-consumer-rights` bundle, so a consent recorded against an older wording is told apart.
 */
export const CONSUMER_RIGHTS_COPY_VERSION = '2026-09-23.2'

export const DEFAULT_ALIAS = 'payment'

export const PAYMENT_SERVICE = DEFAULT_ALIAS
