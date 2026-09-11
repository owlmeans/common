import type { InitializedService, LazyService } from '@owlmeans/context'
import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { PluginConfig } from '@owlmeans/config'
import type { PermissionSet } from '@owlmeans/auth'
import type { Config as ApiConfig, Context as ApiContext } from '@owlmeans/server-api'
import type {
  AmountCheckoutPolicy, CheckoutPricingMode, LimitConfig, PlanDuration, Product, ProductPlan,
  ProductType, QuantityCheckoutPolicy, SubscriptionStatus,
} from '@owlmeans/payment'

export interface Config extends ApiConfig {}
export interface Context<C extends Config = Config> extends ApiContext<C> {}

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
  /** Reference unit price in major units; amount checkout uses it only for fulfillment conversion. */
  price: number
  currency?: string
  recurring?: { interval: 'month' | 'year' }
  order?: number
  title?: string
  capabilities?: PermissionSet[]
  limits?: { [key: string]: LimitConfig }
  pricingMode?: CheckoutPricingMode
  amountPolicy?: AmountCheckoutPolicy
  quantityPolicy?: QuantityCheckoutPolicy
  /** Legacy quantity declarations retained for source compatibility. */
  minQuantity?: number
  maxQuantity?: number
  defaultQuantity?: number
}

export interface StripePluginConfig extends PluginConfig { api: string; webhook: string }

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

export interface PaymentPlugin {
  createLink: (ctx: ApiContext, params: CreateLinkParams) => Promise<string>
  handleWebhook: (request: unknown, ctx: ApiContext) => Promise<void>
  initialize?: (ctx: ApiContext) => Promise<void>
  manageSubscription: (ctx: ApiContext, entityId: string, returnUrl: string) => Promise<string>
}
export interface GatewayService extends InitializedService {
  createLink: PaymentPlugin['createLink']
  manageSubscription: PaymentPlugin['manageSubscription']
}
export interface PaymentResourceOptions { dbAlias?: string; serviceAlias?: string }

interface TopUpBase {
  entityId: string
  productSku: string
  planSku?: string
  service: string
  paygate: string
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

export interface SubscriptionCompletion {
  entityId: string
  status: SubscriptionStatus
  productSku: string
  planSku: string
  service: string
  paygate: string
  externalId: string
  isNew: boolean
  capabilities?: PermissionSet[]
  limits?: { [key: string]: LimitConfig }
}
export interface TopUpCallback { (completion: TopUpCompletion, ctx: ApiContext): Promise<void> }
export interface SubscriptionCallback { (completion: SubscriptionCompletion, ctx: ApiContext): Promise<void> }
export interface CompletionObserver extends LazyService {
  onTopUp: (cb: TopUpCallback) => void
  onSubscription: (cb: SubscriptionCallback) => void
  propagateTopUp: (completion: TopUpCompletion, ctx: ApiContext) => Promise<void>
  propagateSubscription: (completion: SubscriptionCompletion, ctx: ApiContext) => Promise<void>
}

export interface PaygateCustomerRecord extends ResourceRecord {
  paygate: string; externalId: string; entityId?: string; profileId?: string
  email?: string; name?: string; taxId?: string
}
export interface PaygateCustomerResource extends MongoResource<PaygateCustomerRecord> {
  loadByPgId: (externalId: string, paygate: string) => Promise<PaygateCustomerRecord | null>
  byEntity: (entityId: string, paygate: string) => Promise<PaygateCustomerRecord | null>
}
export interface PaymentSubscriptionRecord extends ResourceRecord {
  sku: string; productSku: string; entityId: string; service: string; paygate: string
  externalId: string; status: SubscriptionStatus; kind: 'consumable' | 'subscription'
  capabilities?: PermissionSet[]; limits?: { [key: string]: LimitConfig }
  pricingMode?: CheckoutPricingMode; units?: number; amountMinor?: number
  chargeAmountMinor?: number; currency?: string
  createdAt: Date; endsAt?: Date; trialUntil?: Date; canceledAt?: Date
  fulfilledAt?: Date; initialPropagatedAt?: Date
}
export interface PaymentSubscriptionResource extends MongoResource<PaymentSubscriptionRecord> {
  byExternalId: (externalId: string, paygate: string) => Promise<PaymentSubscriptionRecord | null>
}
export interface FingerprintRecord extends ResourceRecord {
  sku: string; hash: string; productId?: string; updatedAt: Date
}
export interface FingerprintResource extends MongoResource<FingerprintRecord> {
  bySku: (sku: string) => Promise<FingerprintRecord | null>
  clear: () => Promise<void>
}
