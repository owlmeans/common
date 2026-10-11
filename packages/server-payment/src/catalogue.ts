import type { PermissionSet } from '@owlmeans/auth'
import { ENTITLING_STATUSES, INTERNAL_PAYGATE, PlanRequired, ProductError, promoHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_PAYGATE_ALIAS } from './consts.js'
import { paymentAccessOf } from './access.js'
import { planHelper } from './plan.js'
import type { EffectivePlan, PaymentPlan, PaymentProduct, PaymentSubscriptionRecord } from './types.js'
import { log } from './log.js'
import type { CatalogueHelper } from './catalogue/types.js'

/** The plan skus already reported unknown — process-wide, so each is warned about once. */
const unknownPlans = new Set<string>()

/** An internal grant with a period end stops entitling at that instant; a paygate row never does. */
const stillEntitles = (row: PaymentSubscriptionRecord, at: Date): boolean =>
  row.paygate !== INTERNAL_PAYGATE || row.periodEnd == null || new Date(row.periodEnd).getTime() > at.getTime()

export const makeCatalogueHelper = (ctx: ApiContext): CatalogueHelper => {
  const access = paymentAccessOf(ctx)

  const findPlan = async (planSku: string): Promise<PaymentPlan | null> => {
    try {
      return await access.payment().plan(planSku) as PaymentPlan
    } catch {
      return null
    }
  }

  const findProduct = async (productSku: string): Promise<PaymentProduct | null> => {
    try {
      return await access.payment().product(productSku) as PaymentProduct
    } catch {
      return null
    }
  }

  const catalogPlans = async (): Promise<PaymentPlan[]> => {
    const products = await access.payment().products()
    const plans: PaymentPlan[] = []
    for (const product of products) {
      plans.push(...await access.payment().allPlans(product.sku) as PaymentPlan[])
    }

    return plans
  }

  const freePlanOf = async (): Promise<PaymentPlan | null> =>
    (await catalogPlans())
      .filter(plan => plan.free === true)
      .sort((a, b) => planHelper.planRank(a) - planHelper.planRank(b) || a.sku.localeCompare(b.sku))[0] ?? null

  const resolveEffectivePlan = async (entityId: string, at: Date = new Date()): Promise<EffectivePlan> => {
    const fallback = await freePlanOf()
    const { items } = await access.subscriptions().list(
      { entityId, status: [...ENTITLING_STATUSES] }, { size: 0 },
    )
    const candidates: Array<{ plan: PaymentPlan, row: PaymentSubscriptionRecord, rank: number }> = []
    for (const row of items.filter(item => stillEntitles(item, at))) {
      const plan = await findPlan(row.planSku)
      if (plan == null) {
        if (!unknownPlans.has(row.planSku)) {
          unknownPlans.add(row.planSku)
          log.warn('Subscription names an unknown plan; ignored', { subscriptionId: row.externalId, planSku: row.planSku })
        }
        continue
      }
      candidates.push({ plan, row, rank: planHelper.planRank(plan) })
    }
    candidates.sort((a, b) => b.rank - a.rank
      || new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime())

    const best = candidates[0]
    if (best != null) {
      return { plan: planHelper.overriddenPlan(best.plan, best.row), subscription: best.row, fallback }
    }
    if (fallback != null) {
      return { plan: fallback, subscription: null, fallback }
    }

    throw new PlanRequired(entityId)
  }

  const entitlementsOf = async (entityId: string, productSkus?: string[]): Promise<PermissionSet[]> => {
    const { plan, subscription } = await resolveEffectivePlan(entityId)
    if (productSkus != null && !productSkus.includes(plan.productSku)) {
      return []
    }
    const at = new Date()

    return (plan.capabilities ?? [])
      .filter(set => promoHelper.promoActive(set.promo, subscription?.createdAt, at))
      .map(({ promo: _promo, ...set }) => set)
  }

  const stripePlansOf = async (): Promise<Array<{ product: PaymentProduct, plans: PaymentPlan[] }>> => {
    const products = await access.payment().products() as PaymentProduct[]
    const result: Array<{ product: PaymentProduct, plans: PaymentPlan[] }> = []
    for (const product of products) {
      if (!(product.gateways ?? []).includes(STRIPE_PAYGATE_ALIAS)) {
        continue
      }
      const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
        .filter(plan => planHelper.isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
      if (plans.length > 0) {
        result.push({ product, plans })
      }
    }

    return result
  }

  const consumablePlanOf = async (
    productSku: string, planSku?: string,
  ): Promise<{ product: PaymentProduct, plan: PaymentPlan }> => {
    const product = await access.payment().product(productSku) as PaymentProduct
    const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
      .filter(plan => planHelper.isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
    if (planSku != null && !plans.some(plan => plan.sku === planSku)) {
      throw new ProductError(`plan:${planSku}`)
    }
    const plan = plans.find(item => item.sku === planSku) ?? plans[0]
    if (plan == null) throw new ProductError('plan')

    return { product, plan }
  }

  return {
    findPlan, findProduct, catalogPlans, freePlanOf, resolveEffectivePlan, entitlementsOf, stripePlansOf,
    consumablePlanOf,
  }
}

/** The catalogue of a context — one per context. */
export const catalogueOf = memoHelper.oncePer(makeCatalogueHelper)
