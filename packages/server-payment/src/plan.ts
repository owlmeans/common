import { ProductType, type ProductPlan } from '@owlmeans/payment'
import type { PaymentPlan, PaymentProduct, PaymentSubscriptionRecord } from './types.js'
import type { PlanHelper } from './plan/types.js'

export const createPlanHelper = (): PlanHelper => {
  const planRank = (plan: Pick<ProductPlan, 'rank'>): number => plan.rank ?? 0

  const isCeiling = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

  const overriddenPlan = (
    plan: PaymentPlan, row: Pick<PaymentSubscriptionRecord, 'overrides'> | null | undefined,
  ): PaymentPlan => {
    const limits = Object.entries(row?.overrides?.limits ?? {})
      .filter(([key, override]) => plan.limits?.[key] != null && isCeiling(override?.limit))
    if (limits.length === 0) {
      return plan
    }

    return {
      ...plan,
      limits: {
        ...plan.limits,
        ...Object.fromEntries(limits.map(([key, override]) => {
          const { promo: _promo, ...declaration } = plan.limits![key]
          return [key, { ...declaration, limit: override.limit }]
        })),
      },
    }
  }

  const planLookupKey = (product: PaymentProduct, plan: PaymentPlan): string =>
    product.type === ProductType.Consumable ? `${product.sku}-consumable` : plan.sku

  const gatewaysOf = (product: PaymentProduct, plan: PaymentPlan): string[] | undefined =>
    plan.gateways ?? product.gateways ?? undefined

  const isSoldThrough = (product: PaymentProduct, plan: PaymentPlan, paygate: string): boolean => {
    if (plan.free === true) {
      return false
    }
    const gateways = gatewaysOf(product, plan)

    return gateways == null || gateways.includes(paygate)
  }

  const isForSale = (product: PaymentProduct, plan: PaymentPlan): boolean => {
    if (plan.free === true) {
      return false
    }
    const gateways = gatewaysOf(product, plan)

    return gateways == null || gateways.length > 0
  }

  return { planRank, overriddenPlan, planLookupKey, isSoldThrough, isForSale }
}

export const planHelper = createPlanHelper()

/** @deprecated compat:factory-refactor — use `planHelper.overriddenPlan(…)` */
export const overriddenPlan = (
  plan: PaymentPlan, row: Pick<PaymentSubscriptionRecord, 'overrides'> | null | undefined,
): PaymentPlan => planHelper.overriddenPlan(plan, row)
