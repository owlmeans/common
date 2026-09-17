import type { InitializedService } from '@owlmeans/context'

import type {
  CheckoutPricingMode, LimitKind, LimitWindow, PaymentEntityType, PlanDuration, PlanStatus, PortalFlow,
  ProductType, SubscriptionStatus
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
}
