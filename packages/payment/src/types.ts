import type { InitializedService } from '@owlmeans/context'

import type {
  CancellationKind, CancellationStatus, CheckoutPricingMode, ConsumerRegion, LimitKind, LimitWindow,
  PaymentEntityType, PlanDuration, PlanStatus, PortalFlow, ProductType, PurchaseKind, SubscriptionStatus,
  TaxBehavior, TaxEstimateStatus, TaxType, WithdrawalStatus,
} from './consts.js'
import type { PermissionSet } from '@owlmeans/auth'

export interface Product {
  type: ProductType
  sku: string
  title: string
  description?: string
  defaultLng?: string
  /**
   * Related software services.
   * Actually even if it's a physical product, it can have related 
   * software services.
   */
  services?: string[]
  gateways?: string[]
  capabilities?: PermissionSet[]
}

export interface Localization {
  sku: string
  type: PaymentEntityType
  lng: string
  title?: string
  description?: string
  keywords?: { [key: string]: string }
}

/**
 * A time-boxed grant on a capability set or a limit.
 *
 * In force while `now < until`; with `grandfather`, also for a subscription created before `until`.
 */
export interface PromoDeclaration {
  until: Date
  grandfather?: boolean
}

/** A capability set a plan grants, optionally only while a promo is in force. */
export interface PlanCapability extends PermissionSet {
  promo?: PromoDeclaration
}

/** A counted allowance a plan grants under one key. */
export interface LimitDeclaration {
  kind: LimitKind
  /** The ceiling. `0` means "not included". */
  limit: number
  /** Required for `LimitKind.Window`; ignored otherwise. */
  window?: LimitWindow
  /** A display unit, never interpreted. */
  unit?: string
  promo?: PromoDeclaration
}

export interface ProductPlan {
  productSku: string
  sku: string
  status: PlanStatus
  /**
   * Position among the plans of one product: a higher rank is an upgrade. Treated as `0` when
   * absent.
   */
  rank?: number
  /** A plan every entity holds without paying: `price: 0`, no paygate. */
  free?: boolean
  /** The paygates this plan is sold through. Empty for a free plan. */
  gateways?: string[]
  duration: PlanDuration
  trial?: number
  gatedTrial?: boolean
  price: number
  order?: number
  highlight?: string
  currency?: string
  originalPrice?: number
  discount?: number
  awaitingInterval?: number
  title: string
  description?: string
  customUrl?: string
  createdAt?: Date
  archivedAt?: Date
  /**
   * Deprecation date should be set alongside suspnsion date (that should be set to the future).
   * This way we can plan event when users loose access in case they don't upgrade.
   */
  deprecatedAt?: Date
  suspendedAt?: Date
  capabilities?: PlanCapability[]
  limits?: { [key: string]: LimitDeclaration }
  pricingMode?: CheckoutPricingMode
  amountPolicy?: AmountCheckoutPolicy
  quantityPolicy?: QuantityCheckoutPolicy
  /**
   * How the price of a subscription splits for a withdrawal (CJEU C-641/19 PE Digital: pro rata
   * temporis unless the contract states a separately priced component). Absent: the whole price is
   * one `time` component.
   */
  withdrawal?: { components: PlanWithdrawalComponent[] }
}

/**
 * One separately priced part of a plan. A `time` part is deducted pro rata by the days elapsed
 * since the services were requested; a `units` part by the units used after consent. The shares
 * of a plan sum to its price in minor units.
 */
export interface PlanWithdrawalComponent {
  key: string
  basis: WithdrawalBasis
  shareMinor: number
}

export type WithdrawalBasis = 'time' | 'units'

export interface AmountCheckoutPolicy {
  currency: string
  minimumMinor: number
  maximumMinor: number
  defaultMinor: number
  presetsMinor: number[]
  fixedMinor: number
  rateBps: number
}

export interface QuantityCheckoutPolicy {
  minimum: number
  maximum: number
  default: number
}

export interface CreateCheckoutBody {
  productSku: string
  /** The plan to subscribe to, for a subscription checkout. */
  planSku?: string
  /** Renameable organization value carried across a protocol boundary. */
  entitySlug: string
  service: string
  /** Net credit value for amount-priced checkouts, in integer currency minor units. */
  amountMinor?: number
  subscriptionId?: string
  successUrl?: string
  cancelUrl?: string
  /** The billing country the buyer declared (ISO 3166-1 alpha-2). A locked profile overrides it. */
  country?: string
  /** The subscription start request recorded right before this checkout. */
  startRequestId?: string
}

export interface CreateCheckoutResponse {
  url: string
}

/**
 * What an entity may do and how much of each limit is left, at one instant.
 *
 * The one read both the server gate and the browser consume. Built by `entitlementViewOf`.
 */
export interface EntitlementView {
  plan: EntitlementPlanView
  capabilities: CapabilityView[]
  limits: LimitView[]
  at: Date
}

/** The effective plan and the subscription behind it. */
export interface EntitlementPlanView {
  sku: string
  productSku: string
  title: string
  rank: number
  free: boolean
  status: SubscriptionStatus
  paygate: string
  subscriptionId?: string
  /** When the subscription was created — what a grandfathered promo is measured against. */
  subscribedAt?: Date
  periodStart?: Date
  periodEnd?: Date
  cancelAtPeriodEnd?: boolean
  trialEnd?: Date
  pausedAt?: Date
  pastDue?: boolean
  /** The plan the entity falls back to when this one ends. */
  fallbackSku?: string
}

export interface CapabilityView {
  /** `[scope:]permission`, exactly as the capability gate takes it. */
  param: string
  scope: string
  permission: string
  value: boolean | number
  /** False when the set's promo is no longer in force. */
  granted: boolean
  promo?: PromoView
}

export interface LimitView {
  key: string
  /** `limit:<key>`, exactly as the limit gate takes it. */
  param: string
  kind: LimitKind
  window?: LimitWindow
  /** The ceiling in force now: `0` when a promo has lapsed. */
  limit: number
  used: number
  /** `max(0, limit - used)`. */
  remaining: number
  windowStart?: Date
  /** Exclusive: the first instant of the next window. */
  resetsAt?: Date
  unit?: string
  promo?: PromoView
}

export interface PromoView {
  until: Date
  /** The subscription predates `until` and the promo grandfathers it. */
  grandfathered: boolean
  active: boolean
}

/**
 * Declared once per configuration (a `PRICING_POLICY_RECORD_ID` singleton record). Absent entirely,
 * `DEFAULT_PRICING_POLICY` applies: automatic tax and tax-id collection stay on for every checkout
 * exactly as before this policy existed, no `behavior` is forced onto a synced price, no Adaptive
 * Pricing, and the estimate endpoints stay off.
 */
export interface PricingPolicy {
  tax: {
    /** Stripe Tax on every checkout session (`automatic_tax`, required billing address). */
    automatic: boolean
    /**
     * The behavior synced prices are given. Absent: a price's `tax_behavior` is left untouched
     * (`unspecified`, following the Stripe account default) — never inferred, always declared.
     */
    behavior?: TaxBehavior
    /** VAT/GST id collection at checkout, for reverse charge. */
    collectTaxId: boolean
    /** Serve `PaymentService`'s tax estimate endpoint. Requires `automatic`. */
    estimate: boolean
    /** How long a tax estimate may be served from cache. Absent: the gateway's own default. */
    estimateTtlSeconds?: number
  }
  currency: {
    /** Stripe Adaptive Pricing (`adaptive_pricing.enabled`) on every checkout session. */
    adaptive?: boolean
    /** Serve the "≈ local total" line of an estimate. Requires `currency.adaptive`. */
    estimate: boolean
    /** How long an FX quote may be served from cache. Absent: the gateway's own default. */
    estimateTtlSeconds?: number
  }
}

export interface PriceEstimateBody {
  /** Absent: the product's own reference plan (e.g. an amount-priced consumable). */
  planSku?: string
  /** ISO 3166-1 alpha-2. Absent: taken from the entity's paygate customer, else `location-required`. */
  country?: string
}

export interface TaxRateEstimate {
  type: TaxType
  /** The rate as Stripe states it, e.g. `"23"` or `"8.5"` — display only. */
  percentage: string
  /** The same rate as parts per million, exact: `23%` is `230000`. Never a float. */
  ratePpm: number
  country?: string
  state?: string
}

export interface TaxEstimate {
  status: TaxEstimateStatus
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  /**
   * Whether `rates` scales linearly to any other amount (a flat fee, a reduced-rate portion, or
   * several inclusive rates do not). `false` means only the reference amount's own totals are
   * trustworthy — a different amount shows "tax at checkout" instead of being rescaled.
   */
  scalable: boolean
  rates: TaxRateEstimate[]
}

export interface PriceEstimate {
  /** The billing country the estimate was computed for, when one was resolved. */
  country?: string
  /**
   * Where that country came from — absent when neither the request nor the customer named one;
   * `profile` when the entity's billing country is locked, which overrides the request.
   */
  source?: 'request' | 'customer' | 'profile'
  /** The country is the locked billing country; a picker shows it and does not change it. */
  locked?: boolean
  /** The consumer region of `country`. */
  region?: ConsumerRegion
  /** The integration currency (lowercase ISO 4217) the amounts above and `tax` are stated in. */
  currency: string
  behavior: TaxBehavior
  tax: TaxEstimate
  /** The approximate total in the country's own currency, when it differs and a rate was found. */
  local?: {
    currency: string
    /**
     * Integration-currency (`currency` above) units per one unit of `local.currency`, fee-inclusive
     * (Stripe FX Quotes `exchange_rate`, requested `to_currency: currency, from_currencies:
     * [local.currency]`). A local amount is `amountInCurrency / exchangeRate`.
     */
    exchangeRate: number
    fxFeeRate?: number
  }
}

export interface PortalLinkBody {
  flow: PortalFlow
  /** The target plan of a `PortalFlow.Change`. */
  planSku?: string
  returnUrl?: string
}

export interface PortalLinkResponse {
  url: string
}

/** One counter reading: how much of `key` is used in `window` (a `windowKeyOf` value). */
export interface LimitUsage {
  key: string
  window: string
  used: number
}

type PaymentEntity = Product | ProductPlan | PermissionSet

export interface PaymentService extends InitializedService {
  product: (sku: string) => Promise<Product>

  products: () => Promise<Product[]>

  plans: (productSku: string, duration: PlanDuration) => Promise<ProductPlan[]>

  plan: (planSku: string) => Promise<ProductPlan>

  allPlans: (productSku: string) => Promise<ProductPlan[]>

  localize: (lng: string, entity: PaymentEntity) => Promise<Localization | null>

  shallowAuthentication: (token: string | null) => Promise<string>

  /** The declared `PricingPolicy`, or `DEFAULT_PRICING_POLICY` when none was declared. */
  pricingPolicy: () => Promise<PricingPolicy>

  /** The declared `ConsumerRightsPolicy`, or `null` when the application declared none. */
  consumerRightsPolicy: () => Promise<ConsumerRightsPolicy | null>
}

// --- Consumer rights --------------------------------------------------------------------------

/** The legal documents and functions of one language. Every value is an absolute https URL. */
export interface ConsumerRightsLinks {
  billingTerms: string
  withdrawalInformation?: string
  withdrawalForm?: string
  /** The public withdrawal function — the address the Billing Terms name. */
  withdrawalFunction?: string
  /** The public cancellation page. */
  cancellation?: string
}

/** Which consumer-rights mechanisms an application runs. Each is a separate switch. */
export interface ConsumerRightsMechanisms {
  /** Fix the billing country at the first purchase. */
  countryLock: boolean
  /** The terms checkbox and text on every checkout (needs a terms URL at the paygate). */
  checkoutTerms: boolean
  /** Ask for express consent before credits bought inside their window are spent. */
  performanceConsent: boolean
  /** Ask for an express start request before a subscription checkout. */
  subscriptionStart: boolean
  /** The withdrawal function. */
  withdrawal: boolean
  /** Execute a withdrawal's refund at the paygate without an operator. */
  automaticRefunds: boolean
  /** The cancellation function. */
  cancellation: boolean
  /** The purchase confirmation e-mail with the withdrawal information. */
  purchaseConfirmation: boolean
}

/**
 * Declared once per configuration (a `CONSUMER_RIGHTS_RECORD_ID` singleton record). Carries no
 * secret — it is advertised to the browser, which renders the same links and switches the server
 * enforces.
 */
export interface ConsumerRightsPolicy {
  /** The version of the application's Billing Terms and consent wording; a consent records it. */
  textVersion: string
  /** ISO 3166-1 alpha-2 countries whose consumers have the rights. */
  countries: string[]
  /** An unknown billing country is protected (treated as in scope) or ignored. */
  unknownCountry: 'protect' | 'ignore'
  withdrawalDays: number
  deadline: { weekendRollover: boolean, marginDays: number }
  mechanisms: ConsumerRightsMechanisms
  /** The charge currency per region (lowercase ISO 4217), e.g. `{ eu: 'eur', other: 'usd' }`. */
  currencies?: Partial<Record<ConsumerRegion, string>>
  /** Country → language of the legal copy, over `COUNTRY_LANGUAGES`. */
  languages?: Record<string, string>
  defaultLanguage: string
  /** Per language; `defaultLanguage` must be present. */
  links: Record<string, ConsumerRightsLinks>
  /** Whether a renewal opens a new withdrawal window. Off by default. */
  renewalOpensWindow?: boolean
  /** How long a subscription start request stays usable. */
  startRequestTtlSeconds?: number
  /** Whether a buyer with a business tax id is exempt. Off by default: everyone is protected. */
  exemptBusinesses?: boolean
}

/** An entity's billing country, fixed at the first purchase. */
export interface BillingProfileView {
  country: string | null
  region: ConsumerRegion | null
  /** The charge currency, fixed with the country. */
  currency: string | null
  locked: boolean
  lockedAt?: Date
  /** The language of the legal copy for this country. */
  language: string
  inScope: boolean
}

/** One purchase — a contract — and its withdrawal window. */
export interface PurchaseView {
  purchaseId: string
  /** The human contract reference a consumer quotes. */
  contractRef: string
  kind: PurchaseKind
  purchasedAt: Date
  /** Exclusive end of the withdrawal window; absent outside the consumer-rights territories. */
  deadline?: Date
  productSku: string
  planSku?: string
  amountTotalMinor: number
  currency: string
  consentedAt?: Date
  withdrawnAt?: Date
  /** Inside its window, not withdrawn, and something would be reimbursed. */
  withdrawable: boolean
}

export interface PurchaseList {
  purchases: PurchaseView[]
}

/** Whether billed work needs the consumer's express consent now, and what it would cover. */
export interface PerformanceConsentView {
  required: boolean
  region: ConsumerRegion | null
  country: string | null
  /** The language of the legal copy (the billing country's). */
  language: string
  /** The trader named in the statement. */
  trader: string
  textVersion: string
  copyVersion: string
  links: ConsumerRightsLinks
  /** The open, unconsented purchases the consent would cover. */
  purchases: PurchaseView[]
  /** The latest deadline among them. */
  deadline?: Date
  at: Date
}

export interface PerformanceConsentBody {
  purchaseIds: string[]
  textVersion: string
  /** The language the statement was SHOWN in. */
  language: string
  acknowledged: true
  uiLanguage?: string
}

export interface PerformanceConsentResponse {
  consentId: string
  consentedAt: Date
  purchaseIds: string[]
  mailed: boolean
}

export interface SubscriptionStartQuery {
  planSku: string
}

/** Whether a subscription checkout needs an express start request first. */
export interface SubscriptionStartView {
  required: boolean
  planSku: string
  language: string
  trader: string
  textVersion: string
  copyVersion: string
  links: ConsumerRightsLinks
  region: ConsumerRegion | null
}

export interface SubscriptionStartBody {
  planSku: string
  textVersion: string
  language: string
  acknowledged: true
}

export interface SubscriptionStartResponse {
  startRequestId: string
  requestedAt: Date
  expiresAt: Date
}

/** What a withdrawal would reimburse now. */
export interface WithdrawalEstimate {
  refundMinor: number
  currency: string
  timeDeductionMinor: number
  unitsDeductionMinor: number
  elapsedDays?: number
  periodDays?: number
  unitsUsed?: number
  unitsGranted?: number
}

export interface WithdrawalCandidate {
  purchaseId: string
  contractRef: string
  kind: PurchaseKind
  purchasedAt: Date
  deadline: Date
  amountTotalMinor: number
  currency: string
  /** `null` when it cannot be computed (no usage meter). */
  estimate: WithdrawalEstimate | null
  /** The refund is executed without an operator. */
  automatic: boolean
}

export interface WithdrawalCandidateList {
  candidates: WithdrawalCandidate[]
  language: string
  links: ConsumerRightsLinks
  /** Prefill for the form. */
  name?: string
  email?: string
}

/**
 * A withdrawal declaration. In-app it names `purchaseId`; on the public page `contractRef` (or an
 * invoice number) plus the e-mail of the purchase. Only name, contract and e-mail are asked.
 */
export interface WithdrawalBody {
  purchaseId?: string
  contractRef?: string
  name: string
  email: string
  language?: string
  /** A field a person never fills — a filled one marks a bot on a public form. */
  honeypot?: string
}

/** The receipt of a declaration: what was declared and when it arrived. */
export interface DeclarationReceipt {
  declarationId: string
  receivedAt: Date
  /** The declaration as received, field by field — echoed, never enriched with a match. */
  content: Record<string, string>
  mailed: boolean
}

export interface WithdrawalReceipt extends DeclarationReceipt {
  status: WithdrawalStatus
  refundMinor?: number
  currency?: string
  subscriptionCanceled?: boolean
}

export interface CancellationBody {
  kind: CancellationKind
  /** Required for an extraordinary cancellation. */
  reason?: string
  name: string
  contractRef?: string
  subscriptionId?: string
  effective: 'earliest' | 'date'
  /** `YYYY-MM-DD`, with `effective: 'date'`. */
  date?: string
  email: string
  language?: string
  /** A field a person never fills — a filled one marks a bot on a public form. */
  honeypot?: string
}

export interface CancellationReceipt extends DeclarationReceipt {
  status: CancellationStatus
  effectiveAt?: Date
}

/** What the public legal pages need without a login. */
export interface ConsumerRightsPublicView {
  mechanisms: Pick<ConsumerRightsMechanisms, 'withdrawal' | 'cancellation'>
  languages: string[]
  links: Record<string, ConsumerRightsLinks>
  textVersion: string
}

/**
 * One narrowing of an amount checkout's maximum — what a checkout plugin (a spending tier, a
 * rolling cap) answers for one entity at one instant.
 */
export interface AmountNarrowing {
  /** The largest amount (net credit value, minor units) this narrowing allows now. */
  maximumMinor: number
  /** Why — a stable key a UI phrases (`per-purchase`, `window`, `hold` …). */
  reason: string
  /** When the narrowing lifts or widens. */
  resetsAt?: Date
  /** What is left of a rolling allowance, when that is the cause. */
  remainingMinor?: number
}

/**
 * The narrowed limit of an amount checkout, shared by the server's refusal and the dialog's
 * control. `blocked` means no amount may be bought now.
 */
export interface CheckoutLimitView {
  productSku: string
  planSku?: string
  currency: string
  minimumMinor: number
  /** The narrowed maximum — below `minimumMinor` when `blocked`. */
  maximumMinor: number
  narrowed: boolean
  blocked: boolean
  reason?: string
  resetsAt?: Date
  remainingMinor?: number
}

/** An amount policy as narrowed for one entity, and the limit that narrowed it (`null`: none). */
export interface AmountPolicyView {
  policy: AmountCheckoutPolicy
  limit: CheckoutLimitView | null
}

export interface AmountPolicyQuery {
  productSku: string
  planSku?: string
}

/** One price of a plan in one currency, as the paygate charges it. */
export interface PlanPriceView {
  planSku: string
  currency: string
  unitAmountMinor: number
  /** The price's default currency (the others are currency options). */
  default: boolean
  taxBehavior?: TaxBehavior
  interval?: 'month' | 'year'
}

export interface PlanPriceList {
  prices: PlanPriceView[]
}

export interface PlanPricesQuery {
  productSku: string
}
