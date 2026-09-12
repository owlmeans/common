import { toConfigRecord } from '@owlmeans/server-app'
import { plugin } from '@owlmeans/config'
import {
  assertAmountCheckoutPolicy, assertQuantityCheckoutPolicy, CheckoutPricingMode,
  PLAN_RECORD_PREFIX, PLAN_RECORD_TYPE, PlanStatus, PRODUCT_RECORD_PREFIX, PRODUCT_RECORD_TYPE,
} from '@owlmeans/payment'
import { STRIPE_PAYGATE_ALIAS, STRIPE_PLUGIN_CONFIG } from './consts.js'
import type { Config, PaymentPlan, PaymentPlanDef, PaymentProduct, PaymentProductDef } from './types.js'

export const declarePaymentProduct = (cfg: Config, def: PaymentProductDef): void => {
  cfg.records = cfg.records ?? []
  const product: PaymentProduct = {
    type: def.type, sku: def.sku, title: def.name, description: def.description,
    defaultLng: def.defaultLng ?? 'en', services: def.services,
    gateways: def.gateways ?? [STRIPE_PAYGATE_ALIAS], capabilities: def.capabilities,
    taxCode: def.taxCode, unitLabel: def.unitLabel,
  }
  cfg.records.push({ ...toConfigRecord(product), recordType: PRODUCT_RECORD_TYPE, id: `${PRODUCT_RECORD_PREFIX}:${def.sku}` })
}

export const declarePaymentPlan = (cfg: Config, def: PaymentPlanDef): void => {
  cfg.records = cfg.records ?? []
  const pricingMode = def.pricingMode
  if (pricingMode === CheckoutPricingMode.Amount) {
    if (def.amountPolicy == null) throw new TypeError(`Amount checkout plan '${def.sku}' requires amountPolicy`)
    assertAmountCheckoutPolicy(def.amountPolicy)
  }
  const quantityPolicy = def.quantityPolicy ?? (
    def.minQuantity != null || def.maxQuantity != null || def.defaultQuantity != null
      ? {
        minimum: def.minQuantity ?? 1,
        maximum: def.maxQuantity ?? Math.max(100_000, def.minQuantity ?? 1),
        default: def.defaultQuantity ?? def.minQuantity ?? 1,
      }
      : undefined
  )
  if (quantityPolicy != null) assertQuantityCheckoutPolicy(quantityPolicy)

  const plan: PaymentPlan = {
    productSku: def.productSku, sku: def.sku, status: PlanStatus.Active,
    duration: def.duration, price: def.price, currency: def.currency ?? def.amountPolicy?.currency ?? 'usd',
    order: def.order ?? 0, title: def.title ?? def.sku, capabilities: def.capabilities,
    limits: def.limits, recurring: def.recurring, pricingMode, amountPolicy: def.amountPolicy,
    quantityPolicy,
    minQuantity: quantityPolicy?.minimum, maxQuantity: quantityPolicy?.maximum,
    defaultQuantity: quantityPolicy?.default,
  }
  cfg.records.push({ ...toConfigRecord(plan), recordType: PLAN_RECORD_TYPE, id: `${PLAN_RECORD_PREFIX}:${def.sku}` })
}

export const stripeSecrets = (cfg: Config, paths: { api: string; webhook: string }): void => {
  plugin(cfg, { api: paths.api, webhook: paths.webhook }, STRIPE_PLUGIN_CONFIG)
}
