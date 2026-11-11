import type { LazyService } from '@owlmeans/context'
import type { PortalFlow, SubscriptionStatus, TaxBehavior, TaxEstimate } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import type { DisputePhase, PaymentPlan, PaymentProduct, PaymentWebhookRecord, SyncedPriceOption } from '../types.js'

// ---------------------------------------------------------------------------------------------
// The provider contract
// ---------------------------------------------------------------------------------------------

/**
 * What a paygate can put on a checkout beyond the required core. The host compares them with the
 * declared policies when the gateway initializes: a declared policy feature a registered paygate
 * lacks fails the boot (`PaygateError('feature:<flag>:<paygate>')`).
 */
export interface PaygateFeatures {
  /** The session calculates tax itself — required by the pricing policy's `tax.automatic`. */
  automaticTax: boolean
  /** The session collects a business tax id — required by `tax.collectTaxId`. */
  taxIdCollection: boolean
  /** The session shows and charges the buyer's local currency — required by `currency.adaptive`. */
  adaptiveCurrency: boolean
  /** The session collects the acceptance of the terms — required by the consumer-rights `checkoutTerms`. */
  termsConsent: boolean
  /** The longest text the session shows beside a control. Absent: no length is asserted. */
  customTextMax?: number
  /**
   * The session lifetime the paygate accepts. The smallest `sessionTtlSeconds` of the checkout
   * plugins is clamped into it; absent, a session takes no lifetime from the plugins at all.
   */
  sessionTtl?: { minSeconds: number, maxSeconds: number }
}

/**
 * A payment provider: one paygate implementation, registered with
 * `ensurePaymentProviders(ctx).register(provider)` (a provider package's `append…` helper does it).
 * `bind` builds the paygate of one context; `paygatesOf(ctx)` calls it once per context and provider.
 */
export interface PaymentProvider {
  /** The paygate id stored on every record the paygate produced (`paygate`) and named in its webhook path. */
  readonly id: string
  readonly features: PaygateFeatures
  bind: (ctx: ApiContext) => Paygate
}

/**
 * One paygate bound to a context. `customers` and `checkout` are required; every other capability is
 * optional and its absence has a defined host reaction:
 *
 * | Absent | Host reaction |
 * |---|---|
 * | `subscriptions` | recurring plans are not for sale through it; resync skips it; a subscription withdrawal is `review`; a cancellation is only received |
 * | `payments` | every withdrawal is `review`; refunds and disputes resolve without charge or invoice reads |
 * | `payments.creditNotes` | a withdrawal refunds proportionally, without a corrective document |
 * | `webhook` | its webhook route throws `PaygateError('capability:webhook')`; the bootstrap skips the endpoint |
 * | `catalogue` | the product sync skips it; a quantity or subscription checkout throws `ProductError('price:<lookup key>')` |
 * | `portal` | a portal link throws `PortalUnavailable('paygate')`; the bootstrap skips the configuration |
 * | `tax` | an estimate answers `at-checkout` |
 * | `fx` | a conversion between two currencies throws `PaygateError('fx-rate:<from>:<to>')`; an estimate has no local line |
 * | `checkout.listCompleted` | the consumer-rights reconcile backfills no purchase |
 */
export interface Paygate {
  readonly id: string
  readonly features: PaygateFeatures
  /** The currency the paygate settles in (lowercase), when it declares one; catalogue prices are converted into it. */
  settlementCurrency: () => Promise<string | undefined>
  customers: PaygateCustomers
  checkout: PaygateCheckout
  subscriptions?: PaygateSubscriptions
  payments?: PaygatePayments
  webhook?: PaygateWebhook
  catalogue?: PaygateCatalogue
  portal?: PaygatePortal
  tax?: PaygateTax
  fx?: PaygateFx
}

/** Every call that moves money or ends a contract carries the host's idempotency key and a note. */
export interface PaygateCall {
  /** The key the paygate deduplicates a retried call by (`withdrawal:<id>:<step>[:<attempt>]`, `cancellation:<id>:schedule[:<attempt>]`). */
  idempotencyKey: string
  /** A note kept on the changed object (`withdrawal:<id>`, `cancellation:<id>`). */
  comment?: string
}

/** Whose paygate state a call touches: the gateway's `owner`. */
export interface PaygateOwner {
  owner: string
}

/** One deployment: its owner and its public webhook URL (`webhookOf(ctx).webhookUrlOf(paygate)`). */
export interface PaygateDeployment extends PaygateOwner {
  webhookUrl: string
}

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

export interface PaygateTaxId {
  type: string
  value: string
  country?: string
}

/** A paygate customer as the host reads it. */
export interface PaygateCustomer {
  id: string
  email?: string
  /** The saved address's country, as the paygate keeps it. */
  country?: string
  /** The saved address alone lets the paygate calculate tax (a country, plus what some countries need). */
  taxLocatable: boolean
  /** Read only when asked for (`retrieve(id, { taxIds: true })`). */
  taxIds?: PaygateTaxId[]
  taxExempt?: 'none' | 'exempt' | 'reverse'
}

export interface CustomerInput {
  entityId: string
  profileId?: string
  service: string
  /** The checkout locale, kept as the customer's preferred locale. */
  locale?: string
  /** Written to the customer — only passed under the paygate's own e-mail lock. */
  email?: string
}

/** The customer fields the application pins on the paygate customer (provider configuration). */
export interface CustomerLocks {
  /** Every checkout passes the buyer's verified e-mail, which the customer carries. */
  email: boolean
  /** The known billing country is pinned on the customer and Checkout keeps it. */
  country: boolean
}

export interface PaygateCustomers {
  /**
   * The entity's customer — the stored one (its locale and, given, e-mail brought up to date), else a
   * new one; the host's `payment-paygate-customer` row follows.
   */
  ensure: (input: CustomerInput) => Promise<PaygateCustomer>
  /** A customer by id, or `null` when the paygate has none (deleted or missing). */
  retrieve: (customerId: string, opts?: { taxIds?: boolean }) => Promise<PaygateCustomer | null>
  /**
   * Save a billing country on the customer: `replace` writes a country-only address (any other line
   * cleared); without it the country is only preselected on an address-less customer.
   */
  setCountry: (customerId: string, country: string, opts: { replace: boolean }) => Promise<PaygateCustomer>
  locks: () => Promise<CustomerLocks>
}

// ---------------------------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------------------------

export type CheckoutMode = 'amount' | 'quantity' | 'subscription'

/** An amount checkout's single inline line. */
export interface AmountSessionLine {
  kind: 'amount'
  productSku: string
  currency: string
  unitAmountMinor: number
  taxBehavior?: TaxBehavior
}

/** A quantity checkout's line on the product's reusable price, the quantity adjustable. */
export interface QuantitySessionLine {
  kind: 'quantity'
  priceId: string
  minimum: number
  maximum: number
  default: number
}

/** A subscription's line on the plan's reusable price, quantity 1. */
export interface SubscriptionSessionLine {
  kind: 'subscription'
  priceId: string
}

export type SessionLine = AmountSessionLine | QuantitySessionLine | SubscriptionSessionLine

/** The texts a session shows; each already within `features.customTextMax`. */
export interface SessionTexts {
  submit?: string
  afterSubmit?: string
  /** The label of the terms acceptance — only with `collectTerms`. */
  terms?: string
}

/** One checkout session as the host decided it. */
export interface SessionInput {
  mode: CheckoutMode
  entityId: string
  productSku: string
  planSku: string
  customerId: string
  line: SessionLine
  /** The session's charge currency (lowercase). */
  currency: string
  /** Force a quantity or subscription session onto `currency` (its reusable price carries it). */
  forceCurrency: boolean
  successUrl?: string
  cancelUrl?: string
  locale?: string
  expiresAt?: Date
  automaticTax: boolean
  collectTaxId: boolean
  /** The customer's saved address is kept: tax follows it and nothing typed at the paygate moves it. */
  keepAddress: boolean
  /** Show and charge the buyer's local currency on this session. */
  adaptiveCurrency: boolean
  /** Collect the acceptance of the terms, labelled `texts.terms`. */
  collectTerms: boolean
  texts: SessionTexts
  /** The session's metadata — the host reads it back from every checkout event. */
  metadata: Record<string, string>
  /** A subscription session: the metadata of the subscription it creates. */
  subscriptionMetadata?: Record<string, string>
}

export interface PaygateSession {
  id: string
  /** Where the buyer pays; `null` when the paygate made no usable session. */
  url: string | null
}

export type CheckoutPaymentStatus = 'paid' | 'unpaid' | 'not-required'

/** What a checkout session says about its buyer. */
export interface CheckoutBuyer {
  /** The billing address's country, as the paygate keeps it. */
  country?: string
  email?: string
  name?: string
  /** A business tax id was given, or the buyer is reverse-charged. */
  business?: boolean
}

/** A checkout session as the host reads it from an event, a listing or a backfill. */
export interface CheckoutSnapshot {
  id: string
  /** A one-time `payment`, a `subscription`, or any other kind the host does not fulfil. */
  mode: 'payment' | 'subscription' | 'other'
  status?: string
  payment: CheckoutPaymentStatus
  /** Promotion codes could be entered. */
  promotionCodes: boolean
  metadata: Record<string, string>
  customerId?: string
  currency?: string
  amountSubtotalMinor?: number | null
  amountTotalMinor?: number | null
  amountTaxMinor?: number | null
  amountDiscountMinor?: number | null
  paymentId?: string
  invoiceId?: string
  subscriptionId?: string
  buyer: CheckoutBuyer
  /** What the buyer saw in their own currency (local-currency pricing). */
  presentment?: { currency?: string, amountMinor?: number }
  /** The terms acceptance the session collected; absent when it collected none. */
  termsAccepted?: boolean
  createdAt?: Date
}

export interface CheckoutPage {
  items: CheckoutSnapshot[]
  /** Pass back for the next page; absent on the last one. */
  cursor?: string
}

export interface PaygateCheckout {
  /** Create the session; a session the paygate refuses for its own configuration alone may be created once more without that option. */
  createSession: (input: SessionInput) => Promise<PaygateSession>
  expireSession: (sessionId: string) => Promise<void>
  /** The units a completed quantity checkout bought. */
  units: (sessionId: string) => Promise<number>
  /** Completed sessions created since `since`, one page at a time. */
  listCompleted?: (since: Date, cursor?: string) => Promise<CheckoutPage>
}

// ---------------------------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------------------------

/** A paygate subscription as the host reads it. */
export interface PaygateSubscription {
  id: string
  customerId?: string
  metadata: Record<string, string>
  status: SubscriptionStatus
  /** The paygate's own status word. */
  externalStatus: string
  /** Collection is paused (or the subscription is). */
  paused: boolean
  /** The plan its item's price names (the price's lookup key, else its own plan sku). */
  planSku?: string
  itemId?: string
  priceId?: string
  unitAmountMinor?: number
  quantity?: number
  priceCurrency?: string
  taxBehavior?: string
  periodStart?: Date
  periodEnd?: Date
  cancelAtPeriodEnd: boolean
  canceledAt?: Date
  endedAt?: Date
  trialEnd?: Date
  latestInvoiceId?: string
  currency?: string
  createdAt?: Date
}

/** When an ordinary cancellation takes effect: the period end, or a later instant. */
export interface CancelSchedule {
  atPeriodEnd: boolean
  /** Without `atPeriodEnd`: the instant it ends (no proration). */
  at?: Date
}

export interface PaygateSubscriptions {
  /** A subscription by id, or `null` when the paygate no longer has it. */
  retrieve: (subscriptionId: string) => Promise<PaygateSubscription | null>
  /** End it at once, without proration or a final invoice. `alreadyCanceled`: it had ended. */
  cancelNow: (subscriptionId: string, call: PaygateCall) => Promise<{ alreadyCanceled: boolean }>
  scheduleCancel: (subscriptionId: string, when: CancelSchedule, call: PaygateCall) => Promise<void>
}

// ---------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------

export interface PaygateCharge {
  id: string
  paymentId?: string
  invoiceId?: string
  /** What the customer paid, tax included. */
  amountMinor?: number
  /** Refunded on it so far. */
  refundedMinor?: number
}

export interface PaygateInvoice {
  id: string
  number?: string
  /** Its first line — what a credit note corrects. */
  firstLineId?: string
  paymentId?: string
  subscriptionId?: string
  /** The customer address's country, as the paygate keeps it. */
  country?: string
  subtotalMinor?: number
  taxMinor?: number
  totalMinor?: number
  currency?: string
}

export interface PaygateRefund {
  id: string
  /** The paygate's own status word; the host applies only a succeeded one. */
  status: string
  succeeded: boolean
  amountMinor: number
  currency: string
  paymentId?: string
  chargeId?: string
  metadata: Record<string, string>
}

export interface PaygateDispute {
  id: string
  status: string
  amountMinor: number
  currency: string
  paymentId?: string
  chargeId?: string
}

export interface RefundInput {
  paymentId: string
  amountMinor: number
  /** Kept on the refund and read back from its events (`withdrawalId`, `purchaseId`). */
  metadata: Record<string, string>
}

/** One invoice line credited by an amount. */
export interface CreditNoteLine {
  invoiceId: string
  lineId: string
  amountMinor: number
}

export interface CreditNoteInput extends CreditNoteLine {
  /** The refund the credit note documents. */
  refundId: string
  memo: string
  metadata: Record<string, string>
}

export interface PaygateCreditNote {
  id: string
  totalMinor: number
  currency: string
}

export interface PaygateCreditNotes {
  /** What a credit note of this line would total (tax included). */
  preview: (line: CreditNoteLine) => Promise<{ totalMinor: number }>
  create: (input: CreditNoteInput, call: PaygateCall) => Promise<PaygateCreditNote>
  /** A live credit note of the invoice carrying this metadata — what a retry adopts. */
  find: (invoiceId: string, metadata: Record<string, string>) => Promise<PaygateCreditNote | null>
}

export interface PaygatePayments {
  /** A charge by id, or `null` when the paygate has none. */
  charge: (chargeId: string) => Promise<PaygateCharge | null>
  /** An invoice by id, or `null` when the paygate has none. */
  invoice: (invoiceId: string) => Promise<PaygateInvoice | null>
  refund: (input: RefundInput, call: PaygateCall) => Promise<PaygateRefund>
  /** A live refund of the payment carrying this metadata — what a retry adopts. */
  findRefund: (paymentId: string, metadata: Record<string, string>) => Promise<PaygateRefund | null>
  creditNotes?: PaygateCreditNotes
}

// ---------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------

/** A webhook delivery exactly as it arrived: the untouched raw body and the headers. */
export interface PaygateDelivery {
  rawBody?: string | Buffer
  headers: Record<string, string | string[] | undefined>
}

export interface EventCustomer {
  id: string
  email?: string
  name?: string
  taxId?: string
  /** The saved address's country, as the paygate keeps it. */
  country?: string
  currency?: string
  metadata: Record<string, string>
}

export interface CustomerEvent {
  type: 'customer'
  change: 'upserted' | 'deleted'
  customer: EventCustomer
}

export interface CheckoutEvent {
  type: 'checkout'
  /** `completed` also for a delayed payment that succeeded; `failed` a delayed payment that failed. */
  outcome: 'completed' | 'failed' | 'expired'
  session: CheckoutSnapshot
}

export interface SubscriptionChangedEvent {
  type: 'subscription'
  eventId: string
  /** When the paygate produced the event; an older payload than the stored state is not applied. */
  createdAt: Date
  subscription: PaygateSubscription
  /** The subscription was deleted: stored as canceled, whatever its payload says. */
  deleted: boolean
  /** The paygate announced the trial ends soon. */
  trialEnding: boolean
}

export interface EventInvoice {
  id: string
  subscriptionId?: string
  customerId?: string
  /** A renewal of the subscription's cycle. */
  renewal: boolean
  attempt?: number
  nextAttemptAt?: Date
}

export interface InvoiceEvent {
  type: 'invoice'
  eventId: string
  change: 'paid' | 'payment-failed' | 'action-required' | 'uncollectible' | 'voided'
  invoice: EventInvoice
}

export interface RefundChangedEvent {
  type: 'refund'
  refund: PaygateRefund
  /** The refunded charge, when the event carries it. */
  charge?: PaygateCharge
}

export interface DisputeChangedEvent {
  type: 'dispute'
  phase: DisputePhase
  dispute: PaygateDispute
}

export type PaygateEvent =
  | CustomerEvent | CheckoutEvent | SubscriptionChangedEvent | InvoiceEvent | RefundChangedEvent | DisputeChangedEvent

export interface PaygateWebhook {
  /**
   * Verify a delivery against the owner's secrets and translate it into the events the host applies,
   * in order — none for an event type the host does not process.
   *
   * @throws PaygateSignatureError | WebhookSetupError('secret')
   */
  verify: (delivery: PaygateDelivery, owner: PaygateOwner) => Promise<PaygateEvent[]>
  /** Keep the deployment's endpoint at its webhook URL; the row is the host's `payment-webhook` record. */
  ensureEndpoint: (deployment: PaygateDeployment, opts?: { force?: boolean }) => Promise<PaymentWebhookRecord | null>
}

// ---------------------------------------------------------------------------------------------
// Catalogue, portal, tax, FX
// ---------------------------------------------------------------------------------------------

/** A reusable price as the paygate holds it. */
export interface PaygatePrice {
  id: string
  currency: string
  unitAmountMinor?: number
  /** Further currencies it can be charged in. */
  options: Record<string, { unitAmountMinor?: number }>
}

/** One plan resolved for the paygate: its lookup key, its amount in the paygate's currency and its options. */
export interface CataloguePlan {
  plan: PaymentPlan
  lookupKey: string
  unitAmountMinor: number
  currency: string
  options: SyncedPriceOption[]
}

export interface CatalogueSync {
  productId: string
  prices: Array<{ planSku: string, priceId: string, taxBehavior?: string }>
}

export interface PaygateCatalogue {
  /** The active reusable price under a lookup key. @throws ProductError('price:<lookup key>') */
  price: (productSku: string, lookupKey: string) => Promise<PaygatePrice>
  /**
   * Bring one product and its plans' prices to what is declared; an amount plan has no reusable price
   * (its stale ones are deactivated). Answers the price of every other plan.
   */
  syncProduct: (product: PaymentProduct, plans: CataloguePlan[], opts: { behavior: TaxBehavior | null }) => Promise<CatalogueSync>
}

export interface PortalSessionInput {
  customerId: string
  flow: PortalFlow
  returnUrl: string
  /** `Cancel`, `Update`, `Change`: the subscription acted on. */
  subscriptionId?: string
  /** `Change`: the subscription's item switched… */
  itemId?: string
  /** …to the price under this lookup key. */
  lookupKey?: string
  owner: string
  /** The deployment, computed only when the configuration must be ensured first. */
  deployment: () => PaygateDeployment
}

export interface PaygatePortal {
  ensureConfiguration: (deployment: PaygateDeployment, opts?: { force?: boolean }) => Promise<string | null>
  /** The portal session URL. */
  createSession: (input: PortalSessionInput) => Promise<string>
}

export interface TaxInput {
  currency: string
  amountMinor: number
  /** The line's own reference (the plan sku). */
  reference: string
  taxBehavior: TaxBehavior
  taxCode?: string
  country: string
  /** The customer's tax ids of `country`. */
  taxIds: Array<{ type: string, value: string }>
  exemption?: 'exempt' | 'reverse'
}

export interface PaygateTax {
  /** The tax at one country; `null` when the paygate cannot place the buyer (the estimate says `at-checkout`). */
  calculate: (input: TaxInput) => Promise<TaxEstimate | null>
}

/** One unlocked rate: `to` units per one `from` unit. */
export interface FxQuote {
  from: string
  to: string
  /** The fee-inclusive rate. */
  exchangeRate: number
  /** The rate before any fee. */
  baseRate: number
  /** The rate a catalogue amount is converted into the settlement currency at. */
  referenceRate: number
  fxFeeRate?: number
}

export interface PaygateFx {
  quote: (from: string, to: string) => Promise<FxQuote | null>
}

// ---------------------------------------------------------------------------------------------
// The host's registry
// ---------------------------------------------------------------------------------------------

/** The registered payment providers of a context — a lazy service: providers register while the application is wired. */
export interface PaymentProvidersService extends LazyService {
  /** Register a provider; one with the same id is replaced. */
  register: (provider: PaymentProvider) => void
  /** The provider of an id, or `null`. */
  provider: (id: string) => PaymentProvider | null
  /** Every registered provider, in registration order. */
  providers: () => readonly PaymentProvider[]
}

/** The paygates of a context — each provider bound once. */
export interface PaygateRegistry {
  /** The paygate of an id, or `null` when no provider of that id is registered. */
  find: (id: string) => Paygate | null
  /** @throws UnknownPaygate */
  get: (id: string) => Paygate
  /** Every registered paygate, in registration order. */
  all: () => Paygate[]
  /**
   * The paygates a plan is for sale through, in registration order: the ones it is sold through
   * (`planHelper.isSoldThrough` — absent `gateways` is any paygate) that can sell it (a recurring plan
   * needs `subscriptions`), narrowed to `requested` when given.
   */
  forSale: (product: PaymentProduct, plan: PaymentPlan, requested?: string) => Paygate[]
}
