import type { InitializedService, LazyService } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { PluginConfig } from '@owlmeans/config'
import type { PermissionSet } from '@owlmeans/auth'
import type { Config as ApiConfig, Context as ApiContext } from '@owlmeans/server-api'
import type {
  AmountCheckoutPolicy, CheckoutPricingMode, EntitlementView, LimitDeclaration, LimitView,
  PlanCapability, PlanDuration, PortalFlow, PriceEstimate, PricingPolicy, Product, ProductPlan,
  ProductType, QuantityCheckoutPolicy, SubscriptionStatus,
} from '@owlmeans/payment'

export interface Config extends ApiConfig {}
export interface Context<C extends Config = Config> extends ApiContext<C> {}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

export interface PaymentProduct extends Product {
  taxCode?: string
  unitLabel?: string
}

export interface PaymentPlan extends ProductPlan {
  recurring?: { interval: 'month' | 'year' }
  minQuantity?: number
  maxQuantity?: number
  defaultQuantity?: number
  pricingMode?: CheckoutPricingMode
  amountPolicy?: AmountCheckoutPolicy
  quantityPolicy?: QuantityCheckoutPolicy
}

export interface PaymentProductDef {
  sku: string
  type: ProductType
  services: string[]
  gateways?: string[]
  taxCode?: string
  name: string
  description?: string
  unitLabel?: string
  defaultLng?: string
  capabilities?: PermissionSet[]
}

export interface PaymentPlanDef {
  productSku: string
  sku: string
  duration: PlanDuration
  /** Position among the plans of one product; a higher rank is an upgrade. Absent reads as `0`. */
  rank?: number
  /** Held without paying: `price: 0` and no gateway. */
  free?: boolean
  /** Paygates the plan is sold through. Absent: the product's gateways. A free plan has none. */
  gateways?: string[]
  /** Reference unit price in major units; amount checkout uses it only for fulfillment conversion. */
  price: number
  currency?: string
  recurring?: { interval: 'month' | 'year' }
  order?: number
  title?: string
  capabilities?: PlanCapability[]
  limits?: { [key: string]: LimitDeclaration }
  pricingMode?: CheckoutPricingMode
  amountPolicy?: AmountCheckoutPolicy
  quantityPolicy?: QuantityCheckoutPolicy
  /** Legacy quantity declarations retained for source compatibility. */
  minQuantity?: number
  maxQuantity?: number
  defaultQuantity?: number
}

/** File paths (or values) of the Stripe secrets. The webhook secret is an optional override. */
export interface StripeSecretsDef { api: string; webhook?: string }
export interface StripePluginConfig extends PluginConfig { api: string; webhook?: string }

/** Stripe-only pricing settings — never a browser-visible field (see `PricingPolicy` for those). */
export interface StripePricingDef {
  /** Overrides `STRIPE_FX_QUOTES_API_VERSION`, when Stripe moves or renames the preview. */
  fxApiVersion?: string
  /**
   * Let a matching `unspecified` price take the declared `tax.behavior` even when the Stripe
   * account's own tax-settings default resolves to the opposite one — which changes what an
   * existing subscriber is charged at their next renewal. Absent/`false`: such a price is left
   * `unspecified` and a `console.error` explains why.
   */
  migrateUnspecifiedPrices?: boolean
}
export interface StripePricingPluginConfig extends PluginConfig, StripePricingDef {}

/** `declarePaymentPricing`'s argument: the browser-safe `PricingPolicy` plus Stripe-only settings. */
export interface PricingDef extends PricingPolicy {
  stripe?: StripePricingDef
}

/** What the managed customer portal configuration shows. */
export interface PortalBrandingDef {
  headline?: string
  privacyPolicyUrl?: string
  termsOfServiceUrl?: string
  /** Where the portal's "return" link leads when a session names none. Absolute URL. */
  returnUrl: string
}
export interface PortalBrandingConfig extends PluginConfig, PortalBrandingDef {}

// ---------------------------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------------------------

export interface CreateLinkParams {
  productSku: string
  /** Stable database key resolved by the application before this in-process call. */
  entityId: string
  profileId?: string
  service: string
  planSku?: string
  amountMinor?: number
  successUrl?: string
  cancelUrl?: string
}

export interface PortalLinkOptions {
  flow: PortalFlow
  /** The target plan of `PortalFlow.Change`. */
  planSku?: string
  returnUrl: string
}

export interface PriceEstimateParams {
  productSku: string
  /** Stable database key resolved by the application before this in-process call. */
  entityId: string
  /** Absent: the product's own reference plan (an amount-priced consumable). */
  planSku?: string
  /** ISO 3166-1 alpha-2. Absent: taken from the entity's paygate customer address. */
  country?: string
}

export interface GrantInternalPlanOptions {
  /** Required to grant a plan that is not `free`. */
  force?: boolean
  /** When the grant stops entitling. Absent: never. */
  periodEnd?: Date
}

export interface SubscriptionRef {
  entityId?: string
  /** The paygate subscription id (`sub_…`). */
  subscriptionId?: string
}

export interface GatewayService extends InitializedService {
  /** `false` when registered with `manage: false`: every Stripe-calling method throws. */
  managed: boolean
  createLink: (ctx: ApiContext, params: CreateLinkParams) => Promise<string>
  portalLink: (ctx: ApiContext, entityId: string, opts: PortalLinkOptions) => Promise<string>
  /** @throws PaygateError('unmanaged') when `managed` is `false`. */
  estimatePrice: (ctx: ApiContext, params: PriceEstimateParams) => Promise<PriceEstimate>
  grantInternalPlan: (
    ctx: ApiContext, entityId: string, planSku: string, opts?: GrantInternalPlanOptions,
  ) => Promise<PaymentSubscriptionRecord>
  /** @returns how many subscription rows changed */
  resyncSubscription: (ctx: ApiContext, ref: SubscriptionRef) => Promise<number>
  resyncAll: (ctx: ApiContext) => Promise<{ scanned: number; updated: number }>
}

export interface PaymentGatewayOptions {
  dbAlias?: string
  serviceAlias?: string
  /**
   * `false` for a process that must read entitlements but never talk to Stripe: no Stripe
   * bootstrap at init, and `createLink` / `portalLink` / `resync*` throw `PaygateError('unmanaged')`.
   */
  manage?: boolean
}

/** @deprecated use `PaymentGatewayOptions` */
export type PaymentResourceOptions = PaymentGatewayOptions

// ---------------------------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------------------------

interface TopUpBase {
  entityId: string
  productSku: string
  planSku?: string
  service: string
  paygate: string
  /** The checkout session id — the consumer's idempotency key (`payment:<externalId>`). */
  externalId: string
}
export interface QuantityTopUpCompletion extends TopUpBase {
  mode: 'quantity'
  units: number
}
export interface AmountTopUpCompletion extends TopUpBase {
  mode: 'amount'
  amountMinor: number
  chargeAmountMinor: number
  currency: string
}
export type TopUpCompletion = QuantityTopUpCompletion | AmountTopUpCompletion

export type SubscriptionChange = 'created' | 'renewed' | 'upgraded' | 'downgraded' | 'cancel-scheduled'
  | 'cancel-undone' | 'canceled' | 'paused' | 'resumed' | 'past-due' | 'suspended' | 'trial-ending'

export interface SubscriptionSnapshot {
  entityId: string
  planSku: string
  productSku: string
  rank: number
  status: SubscriptionStatus
  paygate: string
  /** The subscription row's `externalId`. */
  subscriptionId: string
  service: string
  periodStart?: Date
  periodEnd?: Date
  cancelAtPeriodEnd?: boolean
  trialEnd?: Date
  pausedAt?: Date
  createdAt?: Date
  capabilities?: PlanCapability[]
  limits?: { [key: string]: LimitDeclaration }
}

export interface SubscriptionEvent {
  change: SubscriptionChange
  /** The state last propagated to observers; `null` for `created`. */
  previous: SubscriptionSnapshot | null
  current: SubscriptionSnapshot
  /** `ENTITLING_STATUSES.includes(current.status)`. */
  active: boolean
  eventKey: string
  invoiceId?: string
  externalEventId?: string
}

export type PaymentTargetKind = 'fulfillment' | 'subscription'

export interface RefundEvent {
  entityId: string
  target: PaymentTargetKind
  productSku?: string
  planSku?: string
  /** The target row's `externalId` (checkout session or subscription). */
  externalId: string
  refundId: string
  paymentIntentId?: string
  invoiceId?: string
  /** This refund. */
  amountMinor: number
  /** Everything refunded on the charge so far, this refund included. */
  refundedTotalMinor: number
  /** What the customer paid on the refunded charge, tax included. */
  paidMinor?: number
  currency: string
  /** Less than the whole charge has been refunded. */
  partial: boolean
  eventKey: string
  /** Fulfillment targets: the net value credited at checkout. */
  netAmountMinor?: number
  /** Fulfillment targets: the pre-tax subtotal charged at checkout. */
  chargeAmountMinor?: number
}

export type DisputePhase = 'opened' | 'funds-withdrawn' | 'funds-reinstated' | 'closed'

export interface DisputeEvent {
  entityId: string
  target: PaymentTargetKind
  productSku?: string
  planSku?: string
  externalId: string
  disputeId: string
  phase: DisputePhase
  /** The paygate's dispute status (`needs_response`, `won`, `lost`, …). */
  status: string
  amountMinor: number
  currency: string
  eventKey: string
  netAmountMinor?: number
  chargeAmountMinor?: number
}

export interface PaymentFailedEvent {
  entityId: string
  kind: 'checkout' | 'invoice'
  /** The checkout session or invoice id. */
  externalId: string
  subscriptionId?: string
  invoiceId?: string
  attempt?: number
  actionRequired?: boolean
  nextAttemptAt?: Date
  eventKey: string
}

export interface TopUpCallback { (completion: TopUpCompletion, ctx: ApiContext): Promise<void> }
export interface SubscriptionCallback { (event: SubscriptionEvent, ctx: ApiContext): Promise<void> }
export interface RefundCallback { (event: RefundEvent, ctx: ApiContext): Promise<void> }
export interface DisputeCallback { (event: DisputeEvent, ctx: ApiContext): Promise<void> }
export interface PaymentFailedCallback { (event: PaymentFailedEvent, ctx: ApiContext): Promise<void> }

/** Callbacks run sequentially and are awaited; a throw escapes so the paygate retries. */
export interface CompletionObserver extends LazyService {
  onTopUp: (cb: TopUpCallback) => void
  onSubscription: (cb: SubscriptionCallback) => void
  onRefund: (cb: RefundCallback) => void
  onDispute: (cb: DisputeCallback) => void
  onPaymentFailed: (cb: PaymentFailedCallback) => void
  propagateTopUp: (completion: TopUpCompletion, ctx: ApiContext) => Promise<void>
  propagateSubscription: (event: SubscriptionEvent, ctx: ApiContext) => Promise<void>
  propagateRefund: (event: RefundEvent, ctx: ApiContext) => Promise<void>
  propagateDispute: (event: DisputeEvent, ctx: ApiContext) => Promise<void>
  propagatePaymentFailed: (event: PaymentFailedEvent, ctx: ApiContext) => Promise<void>
}

// ---------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------

export interface PaygateCustomerRecord extends ResourceRecord {
  paygate: string
  externalId: string
  entityId?: string
  profileId?: string
  email?: string
  name?: string
  taxId?: string
  deletedAt?: Date
}
export interface PaygateCustomerResource extends MongoResource<PaygateCustomerRecord> {
  loadByPgId: (externalId: string, paygate: string) => Promise<PaygateCustomerRecord | null>
  byEntity: (entityId: string, paygate: string) => Promise<PaygateCustomerRecord | null>
}

/** The classification inputs last propagated to observers. */
export interface PropagatedState {
  planSku: string
  rank: number
  status: SubscriptionStatus
  cancelAtPeriodEnd?: boolean
  pausedAt?: Date
  /** The renewal invoice last reported as `renewed` — a renewal is reported once per invoice. */
  renewedInvoiceId?: string
}

/** One row per subscription — paygate (`sub_…`) or internal (`free:<entityId>`, `internal:<planSku>:<entityId>`). */
export interface PaymentSubscriptionRecord extends ResourceRecord {
  entityId: string
  planSku: string
  productSku: string
  service: string
  paygate: string
  externalId: string
  itemId?: string
  priceId?: string
  status: SubscriptionStatus
  externalStatus?: string
  rank: number
  periodStart?: Date
  periodEnd?: Date
  cancelAtPeriodEnd?: boolean
  canceledAt?: Date
  endedAt?: Date
  pausedAt?: Date
  trialEnd?: Date
  latestInvoiceId?: string
  customerId?: string
  disputedAt?: Date
  disputeStatus?: string
  createdAt: Date
  updatedAt?: Date
  /** The paygate-side instant of the state stored; an older event payload is not applied. */
  syncedAt?: Date
  lastEventId?: string
  initialPropagatedAt?: Date
  propagated?: PropagatedState
}
export interface PaymentSubscriptionResource extends MongoResource<PaymentSubscriptionRecord> {
  byExternalId: (externalId: string, paygate: string) => Promise<PaymentSubscriptionRecord | null>
  byItemId: (itemId: string, paygate: string) => Promise<PaymentSubscriptionRecord | null>
}

/** A one-time checkout session: pending until observers succeed, then `fulfilledAt`. */
export interface PaymentFulfillmentRecord extends ResourceRecord {
  entityId: string
  productSku: string
  planSku?: string
  service: string
  paygate: string
  externalId: string
  paymentIntentId?: string
  chargeId?: string
  invoiceId?: string
  mode: CheckoutPricingMode
  units?: number
  amountMinor?: number
  chargeAmountMinor?: number
  currency?: string
  createdAt: Date
  fulfilledAt?: Date
  failedAt?: Date
  refundedMinor?: number
  refundedAt?: Date
  disputedAt?: Date
  disputeStatus?: string
}
export interface PaymentFulfillmentResource extends MongoResource<PaymentFulfillmentRecord> {
  byExternalId: (externalId: string, paygate: string) => Promise<PaymentFulfillmentRecord | null>
}

/** The paygate webhook endpoint this deployment owns, with its signing secret. */
export interface PaymentWebhookRecord extends ResourceRecord {
  paygate: string
  service: string
  url: string
  externalId: string
  secret: string
  apiVersion: string
  events: string[]
  hash: string
  createdAt: Date
  updatedAt?: Date
}
export interface PaymentWebhookResource extends MongoResource<PaymentWebhookRecord> {}

/** A usage event — the source of truth of every limit counter. */
export interface PaymentUsageRecord extends ResourceRecord {
  entityId: string
  limitKey: string
  /** `windowKeyOf` of the limit when the event was written. */
  window: string
  /** `+n` consumed, `-n` released, any sign for a reconciliation adjustment. */
  delta: number
  eventKey: string
  ref?: string
  reason?: string
  planSku?: string
  createdAt: Date
  releasedAt?: Date
}
export interface PaymentUsageResource extends MongoResource<PaymentUsageRecord> {}

/** The projection of the usage ledger per (entity, limit, window). */
export interface PaymentUsageCounterRecord extends ResourceRecord {
  entityId: string
  limitKey: string
  window: string
  used: number
  limit: number
  planSku?: string
  overSince?: Date
  updatedAt: Date
  reconciledAt?: Date
}
export interface PaymentUsageCounterResource extends MongoResource<PaymentUsageCounterRecord> {}

export interface FingerprintRecord extends ResourceRecord {
  sku: string
  hash: string
  productId?: string
  /** The paygate object the fingerprint describes (a portal configuration id). */
  externalId?: string
  updatedAt: Date
}
export interface FingerprintResource extends MongoResource<FingerprintRecord> {
  bySku: (sku: string) => Promise<FingerprintRecord | null>
  clear: () => Promise<void>
}

// ---------------------------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------------------------

export interface EffectivePlan {
  plan: PaymentPlan
  /** The entitling row behind the plan; `null` when the entity falls back to the free plan. */
  subscription: PaymentSubscriptionRecord | null
  /** The declared free plan, when one exists. */
  fallback: PaymentPlan | null
}

export interface ConsumeRequest {
  entityId: string
  limitKey: string
  /** Idempotency key — key it by the record the unit pays for. */
  eventKey: string
  /** Positive safe integer; default `1`. */
  amount?: number
  ref?: string
  reason?: string
}

export interface ReleaseRequest {
  entityId: string
  limitKey: string
  /** The event key the unit was consumed under. */
  eventKey: string
  /** Default: the consumed amount. */
  amount?: number
}

export interface LimitOutcome {
  /** A consume: the unit is held. A release: the release is in effect. */
  admitted: boolean
  /** The event key had been seen before; nothing new was written. */
  replayed: boolean
  limitKey: string
  window: string
  used: number
  limit: number
  remaining: number
  resetsAt?: Date
  eventKey: string
}

export interface OccupancyOutcome {
  limitKey: string
  used: number
  limit: number
  /** `max(0, used - limit)`. */
  over: number
  /** When the entity first went over; absent while it is within the limit. */
  overSince?: Date
}

export interface CounterReconciliation {
  counters: number
  repaired: number
}

export interface EntitlementService extends InitializedService {
  effectivePlan: (entityId: string) => Promise<EffectivePlan>
  entitlements: (entityId: string) => Promise<EntitlementView>
  hasCapability: (entityId: string, param: string) => Promise<boolean>
  /** @throws LimitUnknown */
  limitState: (entityId: string, key: string) => Promise<LimitView>
  /** @throws LimitExhausted | LimitUnknown */
  consume: (req: ConsumeRequest) => Promise<LimitOutcome>
  release: (req: ReleaseRequest) => Promise<LimitOutcome>
  /** @throws LimitUnknown | LimitMisdeclared */
  reconcileOccupancy: (entityId: string, limitKey: string, actual: number) => Promise<OccupancyOutcome>
  reconcileCounters: (entityId?: string) => Promise<CounterReconciliation>
  /**
   * The ACTIVE consume event for this key (not released), or null. This is how a consumer asks
   * "was a unit already spent on this record?" — a consumer keys allowances by the record they pay
   * for (`eventKey = <anything>:<recordId>`, `ref = recordId`) instead of writing a marker onto
   * the record, so a retry replays the same event and a resumed run can re-derive that it is free.
   */
  consumption: (entityId: string, limitKey: string, eventKey: string) => Promise<PaymentUsageRecord | null>
  /**
   * The newest ACTIVE consume event (not released) whose `ref` is this record, or null. For a unit
   * consumed under a fresh event key per cycle (`<key>:<recordId>:<timestamp>`, `ref = recordId`):
   * whether the record holds a unit now, and the event key to release it by.
   */
  consumptionByRef: (entityId: string, limitKey: string, ref: string) => Promise<PaymentUsageRecord | null>
}

export interface ReconcileEntityOptions {
  /** Grant this plan (an internal row) when the entity holds no entitling subscription. */
  freePlanSku?: string
  /** Re-read the entity's paygate subscriptions first (managed gateways only). */
  resync?: boolean
}

export interface ReconcileAllOptions extends ReconcileEntityOptions {
  /** Entities to cover besides those the payment store already knows. */
  entities?: Iterable<string> | AsyncIterable<string>
}

export interface ReconcileAllResult {
  entities: number
  granted: number
  counters: number
  repaired: number
  failed: number
}
