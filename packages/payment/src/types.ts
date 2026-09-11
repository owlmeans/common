import type { InitializedService } from '@owlmeans/context'

import type {
  CheckoutPricingMode, PaymentEntityType, PlanDuration, PlanStatus, ProductType, SubscriptionStatus
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

export interface ProductPlan {
  productSku: string
  sku: string
  status: PlanStatus
  payagateAliases?: {
    [paygate: string]: string | null
  }
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
  supsendedAt?: Date
  capabilities?: PermissionSet[]
  limits?: { [key: string]: LimitConfig }
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

export interface PlanSubscription {
  sku: string
  entityId: string
  paymentMethod?: string
  externalId?: string
  createdAt: Date
  lastPaymentAt?: Date
  trialUntil?: Date
  startsdAt: Date
  expirationAt?: Date
  endsAt?: Date
  archiveAt?: Date
  suspendedAt?: Date
  canceledAt?: Date
  blockedAt?: Date
  suspendedUntil?: Date
  status: SubscriptionStatus
  /**
   * Custom capabilities for the particular subscription.
   */
  capabilities?: PermissionSet[]
  /**
   * Custom limits for the particular subscription.
   */
  limits?: { [key: string]: LimitConfig }
  consumptions?: { [key: string]: CapabilityUsage }
}

export interface CreateCheckoutBody {
  productSku: string
  sku?: string
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

export interface SubscriptionPropagateBody extends Omit<PlanSubscription, 'entityId' | 'externalId'> {
  /** Renameable organization value carried across the propagation protocol. */
  entitySlug: string
  service: string
  externalId: string
}

/**
 * @deprecated Use SubscriptionPropagateBody instead
 */
export type SubscriptionPropogateBody = SubscriptionPropagateBody

export interface LimitConfig {
  interval: PlanDuration
  limit: number
  measurment?: string
}

export interface CapabilityUsage extends LimitConfig {
  startedAt: Date
  refreshedAt?: Date
  refreshAt?: Date
  lastConsumedAt?: Date
  consumption: number
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
