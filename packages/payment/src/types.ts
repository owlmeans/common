import type { PaymentEntityType, PlanDuration, PlanStatus, ProductType, SubscriptionStatus } from './consts.js'
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
  capabilities?: PermissionSet
}

export interface Localization {
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
  createdAt?: Date
  archivedAt?: Date
  /**
   * Deprecation date should be set alongside suspnsion date (that should be set to the future).
   * This way we can plan event when users loose access in case they don't upgrade.
   */
  deprecatedAt?: Date
  supsendedAt?: Date
  capabilities?: PermissionSet
  limits?: { [key: string]: LimitConfig }
}

export interface PlanSubscription {
  sku: string
  entityId: string
  paymentMethod?: string
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
  capabilities?: PermissionSet
  /**
   * Custom limits for the particular subscription.
   */
  limits?: { [key: string]: LimitConfig }
  consumptions?: { [key: string]: CapabilityUsage }
}

export interface LimitConfig {
  interval: PlanDuration
  limit: number
}

export interface CapabilityUsage extends LimitConfig {
  startedAt: Date
  refreshedAt?: Date
  refreshAt?: Date
  lastConsumedAt?: Date
  consumption: number
}
