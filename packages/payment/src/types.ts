import type { InitializedService } from '@owlmeans/context'

import type {
  CheckoutPricingMode, LimitKind, LimitWindow, PaymentEntityType, PlanDuration, PlanStatus, PortalFlow,
  ProductType, SubscriptionStatus, TaxBehavior, TaxEstimateStatus, TaxType
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
}

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
  /** Where that country came from — absent when neither the request nor the customer named one. */
  source?: 'request' | 'customer'
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
}
