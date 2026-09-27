import type Stripe from 'stripe'
import type { InitializedService, LazyService } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { PluginConfig } from '@owlmeans/config'
import type { PermissionSet } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { MailMessage } from '@owlmeans/mailer'
import type { Config as ApiConfig, Context as ApiContext } from '@owlmeans/server-api'
import type {
  AmountCheckoutPolicy, AmountNarrowing, AmountPolicyView, BillingProfileView, CancellationBody,
  CancellationKind, CancellationReceipt, CancellationStatus, CheckoutPricingMode, ConsentKind, ConsumerRegion,
  ConsumerRightsDeclaration, ConsumerRightsLinks, ConsumerRightsPolicy, DeclarationChannel, DeclarationKind,
  EntitlementView, LimitDeclaration, LimitView, PerformanceConsentBody, PerformanceConsentResponse,
  PerformanceConsentView, PlanCapability, PlanDuration, PlanPriceView, PlanWithdrawalComponent, PortalFlow,
  PriceEstimate, PricingPolicy, Product, ProductPlan, ProductType, PurchaseKind, PurchaseView,
  QuantityCheckoutPolicy, SubscriptionStartBody, SubscriptionStartResponse, SubscriptionStartView,
  SubscriptionStatus, WithdrawalBody, WithdrawalCandidateList, WithdrawalReceipt, WithdrawalStatus,
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
  /**
   * Exact prices in further currencies, major units by lowercase ISO 4217 code (`{ usd: 20 }`).
   * Synced as the reusable Price's `currency_options`, never converted.
   */
  currencyPrices?: Record<string, number>
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
  /**
   * Exact prices in further currencies, major units by ISO 4217 code (`{ usd: 20 }`): a recurring
   * or quantity plan's synced Price carries each as a `currency_options` entry at exactly this
   * amount, while its default currency (the settlement currency) is converted as before.
   */
  currencyPrices?: Record<string, number>
  /**
   * The separately priced parts of a subscription for a withdrawal (CJEU C-641/19): their
   * `shareMinor` sum to `round(price × 100)`. Absent: the whole price is one `time` component.
   */
  withdrawal?: { components: PlanWithdrawalComponent[] }
}

/** File paths (or values) of the Stripe secrets. The webhook secret is an optional override. */
export interface StripeSecretsDef { api: string; webhook?: string }
export interface StripePluginConfig extends PluginConfig { api: string; webhook?: string }

/** Stripe-only pricing settings — never a browser-visible field (see `PricingPolicy` for those). */
export interface StripePricingDef {
  /** Overrides `STRIPE_FX_QUOTES_API_VERSION`, when Stripe moves or renames the preview. */
  fxApiVersion?: string
  /**
   * Stripe settlement currency used when a catalogue price is declared in another currency.
   * Recurring prices are converted during product sync; amount checkout is converted per session.
   */
  settlementCurrency?: string
  /** Explicit Stripe payment methods for subscription Checkout; absent keeps Stripe's dynamic selection. */
  subscriptionPaymentMethodTypes?: string[]
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

/**
 * The business the consumer contracts with — backend only, never advertised. `name` is what the
 * express statements say (`{{trader}}` in a consent or start request); the mails' identity line,
 * the withdrawal information and the model form ("To: …") say `legalName`, `address` and `email`.
 */
// A type alias, not an interface: it is stored inside a plugin config record, whose values must be
// index-signature compatible.
export type TraderDef = {
  name: string
  legalName: string
  /** Postal address; without it (or `email`) the mails render without it and the boot warns. */
  address?: string
  email?: string
  website?: string
}

/** The consumer-rights mail options — backend only, never advertised. */
export interface ConsumerMailDef {
  /** The mailer service alias. Default `MAILER_SERVICE`. */
  alias?: string
  from?: string
  replyTo?: string
  /** Evidence archive addresses: each receives its own copy of every consumer-rights mail. */
  bcc?: string[]
}
export interface ConsumerMailPluginConfig extends PluginConfig, ConsumerMailDef {
  trader?: TraderDef
}

/** `declareConsumerRights`'s argument: the advertised policy plus the backend-only trader and mail options. */
export type ConsumerRightsDef = ConsumerRightsDeclaration & { trader?: TraderDef, mail?: ConsumerMailDef }

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
  /** Stripe Checkout and future paid-invoice language. Caller supplies a Stripe-supported locale. */
  locale?: string
  /**
   * Trusted application copy shown beside the Checkout confirmation button — never caller-provided
   * text. A function receives the charge currency and the price the session charges.
   */
  submitText?: string | ((context: CheckoutTextContext) => string)
  successUrl?: string
  cancelUrl?: string
  /** The billing country the buyer declared (ISO 3166-1 alpha-2). A locked profile overrides it. */
  country?: string
  /** The subscription start request recorded right before a subscription checkout. */
  startRequestId?: string
  /** The language the buyer is shown legal copy in; default: the billing country's. */
  consumerLanguage?: string
  /** The request's geolocated country (`cf-ipcountry`) — second location evidence, stored at lock. */
  ipCountry?: string
}

/** What a submit-text function is told about the session it labels. */
export interface CheckoutTextContext {
  language: string
  /** The charge currency, lowercase. */
  currency: string
  /** A subscription's unit price in the charge currency; an amount checkout's pre-tax charge. */
  unitAmountMinor?: number
  interval?: 'month' | 'year'
  region: ConsumerRegion | null
  country?: string
}

// ---------------------------------------------------------------------------------------------
// Checkout plugins
// ---------------------------------------------------------------------------------------------

/** What a plugin narrows: one entity's amount checkout of one plan, at one instant. */
export interface CheckoutNarrowInput {
  entityId: string
  productSku: string
  planSku?: string
  /** The plan's own amount policy — the same for everyone. */
  base: AmountCheckoutPolicy
  at: Date
}

/** A checkout about to be created — what `admit` may veto. */
export interface CheckoutAttempt {
  entityId: string
  productSku: string
  planSku?: string
  mode: 'amount' | 'quantity' | 'subscription'
  /** Amount mode: the net value bought, in the amount policy's currency. */
  amountMinor?: number
  /** The amount policy's currency (amount mode), else the charge currency. */
  amountCurrency?: string
  /** Amount mode: the pre-tax charge in `currency`. */
  chargeMinor?: number
  currency: string
  /** The session lifetime the gateway will set; absent: Stripe's default (24 h). */
  sessionTtlSeconds?: number
  expiresAt?: Date
  at: Date
}

/** A plugin's admission: an optional reservation it binds to the session in `created`. */
export interface CheckoutAdmission {
  reservationId?: string
}

/** The session a checkout became. */
export interface CheckoutCreated extends CheckoutAttempt {
  sessionId: string
  url: string
  /** What this plugin's own `admit` answered. */
  reservationId?: string
}

export type CheckoutOutcome = 'paid' | 'expired' | 'failed'

/**
 * How a checkout ended: `paid` (completed and paid), `expired`, or `failed` — an asynchronous
 * payment failure, or a session that never became usable (a later plugin vetoed, Stripe refused,
 * a `created` threw; then `sessionId` may be absent and `reservationId` names the hold to release).
 */
export interface CheckoutSettled {
  entityId: string
  productSku?: string
  planSku?: string
  sessionId?: string
  reservationId?: string
  outcome: CheckoutOutcome
  amountMinor?: number
  at: Date
}

/**
 * A seam around amount and subscription checkout, registered with `gateway(ctx).use(plugin)` (a
 * plugin with an `alias` registered twice replaces the first). Errors from `narrow` and `admit`
 * propagate — a plugin fails closed; `settled` errors are logged, since holds carry their own TTL.
 */
export interface CheckoutPlugin {
  alias?: string
  /** Lower what this entity may buy now; `null` for no opinion. */
  narrow?: (ctx: ApiContext, input: CheckoutNarrowInput) => Promise<AmountNarrowing | null>
  /** Veto (throw, e.g. `CheckoutLimitExceeded`) or hold a reservation for the session. */
  admit?: (ctx: ApiContext, attempt: CheckoutAttempt) => Promise<CheckoutAdmission | void>
  /** The session exists — bind the reservation. A throw expires the session and rethrows. */
  created?: (ctx: ApiContext, created: CheckoutCreated) => Promise<void>
  /** From the webhook (paid, expired, failed) or from a checkout that never became usable. */
  settled?: (ctx: ApiContext, settled: CheckoutSettled) => Promise<void>
  /** The longest a session may stay open; the gateway uses the smallest, clamped to 30 min–24 h. */
  sessionTtlSeconds?: number
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
  /** Register a checkout plugin; one with an `alias` already registered replaces it. */
  use: (plugin: CheckoutPlugin) => void
  /** The registered checkout plugins, in registration order. */
  checkoutPlugins: () => readonly CheckoutPlugin[]
  /**
   * The entity's amount policy of an amount plan as narrowed NOW — the very computation
   * `createLink` enforces. Mongo and plugins only; works unmanaged.
   */
  amountPolicy: (ctx: ApiContext, entityId: string, productSku: string, planSku?: string) => Promise<AmountPolicyView>
  /** The synced prices of a product's plans, per currency — stored rows, no Stripe call. */
  planPrices: (ctx: ApiContext, productSku: string) => Promise<PlanPriceView[]>
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

/** A Stripe client for one context — the default reads the configured secret. */
export type StripeFactory = (ctx: ApiContext) => Promise<Stripe>

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
  /** Net value in the amount policy's catalogue currency. */
  amountMinor: number
  /** Grossed-up value in the amount policy's catalogue currency, before settlement conversion. */
  sourceChargeAmountMinor: number
  /** The amount policy's catalogue currency. */
  amountCurrency: string
  /** Pre-tax subtotal actually charged by Stripe, in `currency`. */
  chargeAmountMinor: number
  /** Stripe integration/settlement currency. */
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
  /** The refund's own metadata. */
  metadata?: Record<string, string>
  /**
   * Set when the refund executes a withdrawal (`refund.metadata.withdrawalId`): the `onWithdrawal`
   * observer takes back exactly the unused units — an `onRefund` observer must skip its own
   * claw-back for such a refund, or the units are taken back twice.
   */
  withdrawalId?: string
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

/** A consumer's express request was recorded (performance consent or subscription start). */
export interface ConsentEvent {
  kind: ConsentKind
  consentId: string
  entityId: string
  profileId?: string
  /** The purchases the consent covers (none for a start request, which precedes its purchase). */
  purchaseIds: string[]
  planSku?: string
  textVersion: string
  language: string
  decidedAt: Date
  expiresAt?: Date
  /** `consent:<consentId>`. */
  eventKey: string
}

/** A withdrawal executed (`refunded`) or left to an operator (`review`). */
export interface WithdrawalEvent {
  withdrawalId: string
  /** `withdrawal:<withdrawalId>`. */
  eventKey: string
  entityId: string
  channel: DeclarationChannel
  purchase: PurchaseRef
  declaredAt: Date
  status: WithdrawalStatus
  refund: {
    amountMinor: number
    currency: string
    netMinor?: number
    refundId?: string
    creditNoteId?: string
  }
  /**
   * The purchase's units as the usage meter read them: `returned` is what the application takes
   * back (`granted − used`), `null` without a meter.
   */
  units: { granted: number, used: number, returned: number } | null
  subscriptionCanceled: boolean
}

/** A cancellation was declared (matched to a subscription or not). */
export interface CancellationEvent {
  cancellationId: string
  /** `cancellation:<cancellationId>`. */
  eventKey: string
  entityId?: string
  matched: boolean
  channel: DeclarationChannel
  kind: CancellationKind
  status: CancellationStatus
  subscriptionId?: string
  effectiveAt?: Date
  declaredAt: Date
}

export interface TopUpCallback { (completion: TopUpCompletion, ctx: ApiContext): Promise<void> }
export interface SubscriptionCallback { (event: SubscriptionEvent, ctx: ApiContext): Promise<void> }
export interface RefundCallback { (event: RefundEvent, ctx: ApiContext): Promise<void> }
export interface DisputeCallback { (event: DisputeEvent, ctx: ApiContext): Promise<void> }
export interface PaymentFailedCallback { (event: PaymentFailedEvent, ctx: ApiContext): Promise<void> }
export interface ConsentCallback { (event: ConsentEvent, ctx: ApiContext): Promise<void> }
export interface WithdrawalCallback { (event: WithdrawalEvent, ctx: ApiContext): Promise<void> }
export interface CancellationCallback { (event: CancellationEvent, ctx: ApiContext): Promise<void> }

/**
 * Callbacks run sequentially and are awaited. A paygate callback's throw escapes so the paygate
 * retries; a consumer-rights callback (`onConsent`, `onWithdrawal`, `onCancellation`) runs AFTER
 * the records and the paygate steps, and its throw is recorded and retried by `reconcile()`.
 */
export interface CompletionObserver extends LazyService {
  onTopUp: (cb: TopUpCallback) => void
  onSubscription: (cb: SubscriptionCallback) => void
  onRefund: (cb: RefundCallback) => void
  onDispute: (cb: DisputeCallback) => void
  onPaymentFailed: (cb: PaymentFailedCallback) => void
  onConsent: (cb: ConsentCallback) => void
  onWithdrawal: (cb: WithdrawalCallback) => void
  onCancellation: (cb: CancellationCallback) => void
  propagateTopUp: (completion: TopUpCompletion, ctx: ApiContext) => Promise<void>
  propagateSubscription: (event: SubscriptionEvent, ctx: ApiContext) => Promise<void>
  propagateRefund: (event: RefundEvent, ctx: ApiContext) => Promise<void>
  propagateDispute: (event: DisputeEvent, ctx: ApiContext) => Promise<void>
  propagatePaymentFailed: (event: PaymentFailedEvent, ctx: ApiContext) => Promise<void>
  propagateConsent: (event: ConsentEvent, ctx: ApiContext) => Promise<void>
  propagateWithdrawal: (event: WithdrawalEvent, ctx: ApiContext) => Promise<void>
  propagateCancellation: (event: CancellationEvent, ctx: ApiContext) => Promise<void>
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
  /** The paygate customer's billing address country, as its last webhook stated it. */
  country?: string
  /** The paygate customer's own currency (set by its first subscription or invoice). */
  currency?: string
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
  /** The subscription's currency (lowercase). */
  currency?: string
  // Checkout evidence — written once the checkout that created the subscription completed.
  checkoutSessionId?: string
  purchaseId?: string
  firstInvoiceId?: string
  country?: string
  email?: string
  amountTotalMinor?: number
  amountTaxMinor?: number
  termsAccepted?: boolean
  startRequestId?: string
  withdrawnAt?: Date
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
  sourceChargeAmountMinor?: number
  amountCurrency?: string
  chargeAmountMinor?: number
  currency?: string
  createdAt: Date
  fulfilledAt?: Date
  failedAt?: Date
  refundedMinor?: number
  refundedAt?: Date
  disputedAt?: Date
  disputeStatus?: string
  // Checkout evidence.
  country?: string
  email?: string
  profileId?: string
  amountTotalMinor?: number
  amountTaxMinor?: number
  termsAccepted?: boolean
  purchaseId?: string
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

/** One currency option of a synced price. */
export interface SyncedPriceOption {
  currency: string
  unitAmount: number
}

/** A reusable price as the last sync left it — what `planPrices` and checkout read without Stripe. */
export interface SyncedPrice {
  planSku: string
  priceId: string
  lookupKey: string
  /** The default currency and its amount. */
  currency: string
  unitAmount: number
  /** `currency_options` besides the default currency. */
  options: SyncedPriceOption[]
  taxBehavior?: string
  interval?: 'month' | 'year'
  sourceUnitAmount: number
  sourceCurrency: string
  syncedAt: Date
}

export interface FingerprintRecord extends ResourceRecord {
  sku: string
  hash: string
  productId?: string
  /** The paygate object the fingerprint describes (a portal configuration id). */
  externalId?: string
  /** A product's synced reusable prices. */
  prices?: SyncedPrice[]
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

// ---------------------------------------------------------------------------------------------
// Consumer rights — records
// ---------------------------------------------------------------------------------------------

/** Where a billing profile's country came from. */
export type BillingProfileSource = 'checkout' | 'customer' | 'manual'

/** One per organization: the billing country fixed at the first purchase (first write wins). */
export interface BillingProfileRecord extends ResourceRecord {
  entityId: string
  country: string
  region: ConsumerRegion
  /** The charge currency, fixed with the country. */
  currency: string
  /** The language of the legal copy. */
  language: string
  source: BillingProfileSource
  paygate: string
  customerId?: string
  sessionId?: string
  /** The geolocated country of the request that started the locking checkout — VAT evidence. */
  ipCountry?: string
  email?: string
  name?: string
  /** A business tax id was given at the locking checkout. */
  business?: boolean
  lockedAt: Date
  createdAt: Date
  updatedAt?: Date
}
export interface BillingProfileResource extends MongoResource<BillingProfileRecord> {
  byEntity: (entityId: string) => Promise<BillingProfileRecord | null>
}

/**
 * One purchase — a contract and its withdrawal window: a paid one-time checkout (`top-up`) or a
 * subscription's first invoice (`subscription`). Renewals are not purchases.
 */
export interface PurchaseRecord extends ResourceRecord {
  /** `stripe:<session id>` (one-time) or `stripe:<subscription id>`. */
  purchaseId: string
  /** `CR-YYMMDD-XXXXXX` — what a consumer quotes. */
  contractRef: string
  entityId: string
  kind: PurchaseKind
  paygate: string
  sessionId?: string
  subscriptionId?: string
  paymentIntentId?: string
  invoiceId?: string
  invoiceNumber?: string
  invoiceLineId?: string
  productSku: string
  planSku?: string
  profileId?: string
  country?: string
  region?: ConsumerRegion
  ipCountry?: string
  inScope: boolean
  language: string
  email?: string
  name?: string
  business?: boolean
  /** The charge currency. */
  currency: string
  amountSubtotalMinor: number
  amountTaxMinor: number
  amountTotalMinor: number
  presentmentCurrency?: string
  presentmentAmountMinor?: number
  /** Amount checkout: the net value credited, in `amountCurrency`. */
  netAmountMinor?: number
  amountCurrency?: string
  /** Quantity checkout: the units bought. */
  units?: number
  taxBehavior?: string
  /**
   * Stripe's own `consent.terms_of_service` of the checkout — absent when the session did not
   * collect it (the policy's `checkoutTerms` off, or the fallback of a Dashboard without a terms URL).
   */
  termsAccepted?: boolean
  textVersion?: string
  copyVersion?: string
  startRequestId?: string
  /** When the consumer expressly requested the services (the start request) — time deductions count from here. */
  servicesStartedAt?: Date
  /** When the confirmation mail was claimed — one claim per purchase, whatever the outcome of the send. */
  confirmationMailAt?: Date
  purchasedAt: Date
  /** Exclusive end of the withdrawal window; absent outside the consumer-rights territories. */
  deadline?: Date
  consentId?: string
  consentedAt?: Date
  withdrawalId?: string
  withdrawnAt?: Date
  /** Refunded so far on this purchase's payment, tax included. */
  refundedMinor?: number
  /** Set once the whole payment is refunded — the window closes. */
  refundedAt?: Date
  cancellationId?: string
  cancelEffectiveAt?: Date
  createdAt: Date
  updatedAt?: Date
}
export interface PurchaseResource extends MongoResource<PurchaseRecord> {
  byPurchaseId: (purchaseId: string) => Promise<PurchaseRecord | null>
}

/** The request evidence a consumer act is recorded with (`requestOriginOf`). */
export interface RequestOrigin {
  /** `cf-connecting-ip`, else the LAST `x-forwarded-for` entry, else `x-real-ip`, else the socket. */
  ip?: string
  /** The raw `x-forwarded-for` header. */
  forwardedFor?: string
  /** `user-agent`, at most 512 characters. */
  userAgent?: string
  /** `cf-ipcountry`. */
  ipCountry?: string
  acceptLanguage?: string
  /** The channel the request came through (`http`, `mcp`, …), when the application knows. */
  via?: string
}

/** Append-only: one express request — a performance consent or a subscription start request. */
export interface ConsumerConsentRecord extends ResourceRecord, RequestOrigin {
  kind: ConsentKind
  entityId: string
  profileId?: string
  /** The person who gave it — the confirmation is mailed here. */
  name?: string
  email?: string
  purchaseIds: string[]
  planSku?: string
  /** The plan's name as the statement said it (`{{plan}}`). */
  planName?: string
  textVersion: string
  copyVersion: string
  /** The language the statement was shown in. */
  language: string
  uiLanguage?: string
  trader: string
  /** The statement exactly as rendered and recorded. */
  text: { request: string, acknowledgement: string, checkbox: string }
  links: ConsumerRightsLinks
  /** The latest deadline among the covered purchases. */
  deadline?: Date
  decidedAt: Date
  /** A start request stops being usable at this instant. */
  expiresAt?: Date
}
export interface ConsumerConsentResource extends MongoResource<ConsumerConsentRecord> {}

/** Append-only: one withdrawal or cancellation declaration, matched to a contract or not. */
export interface ConsumerDeclarationRecord extends ResourceRecord, RequestOrigin {
  kind: DeclarationKind
  channel: DeclarationChannel
  entityId?: string
  purchaseId?: string
  subscriptionId?: string
  /** The contract as the consumer named it. */
  contractRef?: string
  name: string
  email: string
  cancellationKind?: CancellationKind
  reason?: string
  effective?: 'earliest' | 'date'
  requestedDate?: string
  language: string
  textVersion?: string
  copyVersion: string
  receivedAt: Date
  matched: boolean
  profileId?: string
  /** A repeated declaration of a contract already withdrawn from: the original's id. */
  duplicateOf?: string
  /** The status decided on receipt (`WithdrawalStatus` / `CancellationStatus`); execution steps are events. */
  status: string
  refundMinor?: number
  currency?: string
  effectiveAt?: Date
}
export interface ConsumerDeclarationResource extends MongoResource<ConsumerDeclarationRecord> {}

export type ConsumerEventAction =
  | 'mail' | 'computed' | 'meter' | 'refund' | 'credit-note' | 'subscription-cancel' | 'cancel-scheduled'
  | 'observers' | 'lock' | 'lock-mismatch' | 'relock' | 'unlock' | 'duplicate' | 'checkout-terms-fallback'

export type ConsumerRecordKind = 'purchase' | 'consent' | 'declaration' | 'profile' | 'checkout'

/** Append-only: one execution or audit step. */
export interface ConsumerEventRecord extends ResourceRecord {
  /** The purchase id, consent id, declaration id, or the entity id of a profile or a checkout. */
  recordId: string
  recordKind: ConsumerRecordKind
  entityId?: string
  action: ConsumerEventAction
  /** The mail kind of a `mail` event; the observer family of an `observers` one. */
  step?: string
  ok: boolean
  /** A mail deliberately not sent (a reserved domain, a renderer that suppressed it). */
  skipped?: boolean
  externalId?: string
  amountMinor?: number
  currency?: string
  /** JSON. */
  detail?: string
  error?: string
  at: Date
}
export interface ConsumerEventResource extends MongoResource<ConsumerEventRecord> {}

// ---------------------------------------------------------------------------------------------
// Consumer rights — service
// ---------------------------------------------------------------------------------------------

/** What a usage meter is told about the purchase it reads. */
export interface PurchaseRef {
  purchaseId: string
  kind: PurchaseKind
  entityId: string
  contractRef: string
  productSku: string
  planSku?: string
  /** One-time purchases: the checkout session id. */
  sessionId?: string
  /** Subscription purchases: the paygate subscription id. */
  subscriptionId?: string
  invoiceId?: string
  purchasedAt: Date
}

export interface UsageQuery {
  entityId: string
  purchase: PurchaseRef
  /** The purchase's consent — before it the consumer bears no cost; absent: nothing is deductible. */
  after?: Date
  at: Date
}

export interface UsageReading {
  /** Units the purchase granted. */
  granted: number
  /** Units of it used so far. */
  used: number
  /** Units of it used strictly after `after` (0 without `after`). */
  usedAfter: number
  /** Units of it that paid off an earlier overdraft when it was granted. */
  settled?: number
  /** Units of it already taken back by an earlier (money) refund. */
  clawed?: number
  remaining?: number
}

/**
 * The application's reading of how much of one purchase was used — for a withdrawal's refund.
 * The deduction is `usedAfter + settled + clawed`.
 */
export interface UsageMeter {
  used: (ctx: ApiContext, query: UsageQuery) => Promise<UsageReading>
}

/** Who acts: the organization, and the person's prefill. */
export interface ConsumerSubject {
  entityId: string
  profileId?: string
  name?: string
  email?: string
  /** `public` when an application matched a public declaration to this organization itself. */
  channel?: DeclarationChannel
}

export type ConsumerMailKind = 'purchase' | 'consent' | 'start' | 'withdrawal' | 'cancellation'

/** What a consumer-rights mail is rendered from. */
export interface ConsumerMailData {
  kind: ConsumerMailKind
  /** The purchase id, consent id or declaration id. */
  recordId: string
  entityId?: string
  language: string
  to: string
  name?: string
  trader: TraderDef
  links: ConsumerRightsLinks
  purchase?: PurchaseRecord
  purchases?: PurchaseRecord[]
  consent?: ConsumerConsentRecord
  declaration?: ConsumerDeclarationRecord
}

/**
 * Replace or suppress a consumer-rights mail: answer a message to send it instead, `null` to send
 * nothing (recorded as skipped), `undefined` to send the rendered one.
 */
export type ConsumerMailRenderer = (
  kind: ConsumerMailKind, data: ConsumerMailData, rendered: MailMessage,
) => MailMessage | null | undefined | Promise<MailMessage | null | undefined>

export interface LockOptions {
  customerId?: string
  sessionId?: string
  ipCountry?: string
  email?: string
  name?: string
  business?: boolean
  /** The charge currency; default: an active subscription's, else the region's. */
  currency?: string
  language?: string
  /** `manual` only: replace an existing lock (audited as a `relock` event). */
  force?: boolean
  by?: string
  reason?: string
}

/** Who removes a lock, and why — kept on the `unlock` event. */
export interface UnlockOptions {
  by?: string
  reason?: string
}

export interface ConsumerReconcileOptions {
  /** How far back declarations, mails and observers are retried. Default 30 days. */
  since?: Date
  /** The most items per step. Default 50. */
  limit?: number
}

export interface ConsumerReconcileResult {
  retried: number
  mailed: number
  observed: number
  backfilled: number
  locked: number
  failed: number
}

/**
 * Lazy: reachable while the application is still being wired (`useMeter`, `useMailRenderer` before
 * the context initializes); the gateway's initialization initializes it at boot.
 */
export interface ConsumerRightsService extends LazyService {
  /**
   * `false`: every paygate-calling method (`withdraw`, `cancel`, `reconcile`'s paygate steps) refuses.
   * An explicit `manage` of `appendConsumerRights` wins over the gateway's, whatever the order.
   */
  readonly managed: boolean
  policy: () => Promise<ConsumerRightsPolicy | null>
  /** The locked billing profile, or `null`. */
  profile: (entityId: string) => Promise<BillingProfileView | null>
  /** Lock the billing country; the first write wins unless a `manual` lock is `force`d. */
  lock: (entityId: string, country: string, source: BillingProfileSource, opts?: LockOptions) => Promise<BillingProfileView>
  /**
   * An operator removes the lock: the profile is deleted and an `unlock` event keeps it. No lazy lock
   * from the paygate customer follows (checkout, reconcile); the next completed purchase locks again.
   * @returns the profile as it was, or `null` when nothing was locked
   */
  unlock: (entityId: string, opts?: UnlockOptions) => Promise<BillingProfileView | null>
  purchases: (entityId: string, opts?: { open?: boolean, at?: Date }) => Promise<PurchaseView[]>
  consentView: (entityId: string, at?: Date) => Promise<PerformanceConsentView>
  /** @throws PerformanceConsentRequired (428) for a stale text version */
  recordConsent: (subject: ConsumerSubject, body: PerformanceConsentBody, origin?: RequestOrigin) => Promise<PerformanceConsentResponse>
  /** @throws PerformanceConsentRequired while an open in-scope window has no consent */
  assertConsent: (entityId: string, at?: Date) => Promise<void>
  startView: (entityId: string, planSku: string, opts?: { language?: string }) => Promise<SubscriptionStartView>
  /** @throws SubscriptionStartRequired (428) for a stale text version */
  /** `plan`: the plan's short name the statement says (default: its localized catalogue title). */
  recordStartRequest: (
    subject: ConsumerSubject, body: SubscriptionStartBody, origin?: RequestOrigin, opts?: { plan?: string },
  ) => Promise<SubscriptionStartResponse>
  /**
   * The fresh start request bound to this entity and plan, or `null` when none is required.
   * @throws SubscriptionStartRequired
   */
  assertStartRequest: (entityId: string, planSku: string, startRequestId?: string) => Promise<ConsumerConsentRecord | null>
  withdrawalCandidates: (entityId: string, subject?: Partial<ConsumerSubject>) => Promise<WithdrawalCandidateList>
  /** `subject: null` — the public function: matched by contract reference and e-mail, never disclosed. */
  withdraw: (subject: ConsumerSubject | null, body: WithdrawalBody, origin?: RequestOrigin) => Promise<WithdrawalReceipt>
  cancel: (subject: ConsumerSubject | null, body: CancellationBody, origin?: RequestOrigin) => Promise<CancellationReceipt>
  useMeter: (meter: UsageMeter | null) => void
  useMailRenderer: (renderer: ConsumerMailRenderer | null) => void
  usageMeter: () => UsageMeter | null
  mailRenderer: () => ConsumerMailRenderer | null
  /** Retry refunds, credit notes, cancellations, mails and observers; backfill purchases and legacy locks. */
  reconcile: (opts?: ConsumerReconcileOptions) => Promise<ConsumerReconcileResult>
}

/**
 * `appendConsumerRights` options. `manage`, `usage` and `stripe` apply to the service whenever the
 * call comes — before or after the gateway registered it; the resources' `dbAlias` / `serviceAlias`
 * are those of the first registration.
 */
export interface ConsumerRightsOptions {
  /**
   * `false` in a process that never talks to the paygate (reads and consent asserts only). Absent:
   * the gateway's `manage`, else managed.
   */
  manage?: boolean
  /** The application's usage meter; without one a withdrawal is left to an operator (`review`). */
  usage?: UsageMeter
  alias?: string
  /** The paygate client; default: the configured Stripe secret. */
  stripe?: StripeFactory
  dbAlias?: string
  serviceAlias?: string
}

// ---------------------------------------------------------------------------------------------
// Consumer rights — handlers
// ---------------------------------------------------------------------------------------------

/** What a public declaration is throttled by. */
export interface ConsumerThrottleKey {
  action: 'withdrawal' | 'cancellation'
  email: string
  ip?: string
}

/**
 * The hooks of `consumerRightsEntrypoints`. Every hook gets the request's context last, so an
 * application keeps its counters and lookups on the context, never in module state.
 */
export interface ConsumerRightsHandlerOptions {
  /** The organization a signed-in request acts for. Default: `req.entity.id`. */
  resolveEntity?: (req: AbstractRequest, ctx: ApiContext) => string | null | undefined
  /** The person's profile id and prefill. */
  subjectOf?: (req: AbstractRequest, ctx: ApiContext) => Partial<ConsumerSubject> | Promise<Partial<ConsumerSubject>>
  /** Refuse a money-moving act (consent, start, withdraw, cancel) — e.g. an API-key request. */
  guardMoney?: (req: AbstractRequest, action: string, ctx: ApiContext) => void | Promise<void>
  /** REQUIRED when the public subtree is bound: throw (e.g. 429) to refuse a public declaration. */
  throttle?: (req: AbstractRequest, key: ConsumerThrottleKey, ctx: ApiContext) => void | Promise<void>
  /** The request evidence; default `requestOriginOf`. */
  metaOf?: (req: AbstractRequest, ctx: ApiContext) => RequestOrigin
  /** The least time a public declaration takes to answer, matched or not. Default 1000 ms. */
  publicMinMs?: number
  /** The plan's short name a start request's statement says (default: its localized catalogue title). */
  planNameOf?: (
    planSku: string, language: string, req: AbstractRequest, ctx: ApiContext,
  ) => string | undefined | Promise<string | undefined>
  serviceAlias?: string
}

export interface CheckoutReadHandlerOptions {
  resolveEntity?: (req: AbstractRequest, ctx: ApiContext) => string | null | undefined
  gatewayAlias?: string
}
