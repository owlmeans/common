import { ENTITLING_STATUSES, INTERNAL_PAYGATE, PlanRequired } from '@owlmeans/payment'
import type { ProductPlan } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { payment, subscriptions } from './utils.js'
import type { EffectivePlan, PaymentPlan, PaymentProduct, PaymentSubscriptionRecord } from './types.js'

/** A plan's rank; an absent rank reads as `0`. */
export const planRank = (plan: Pick<ProductPlan, 'rank'>): number => plan.rank ?? 0

/** A plan by sku, or `null` when the catalogue no longer declares it. */
export const findPlan = async (ctx: ApiContext, planSku: string): Promise<PaymentPlan | null> => {
  try {
    return await payment(ctx).plan(planSku) as PaymentPlan
  } catch {
    return null
  }
}

/** A product by sku, or `null`. */
export const findProduct = async (ctx: ApiContext, productSku: string): Promise<PaymentProduct | null> => {
  try {
    return await payment(ctx).product(productSku) as PaymentProduct
  } catch {
    return null
  }
}

/** Every plan of every declared product. */
export const catalogPlans = async (ctx: ApiContext): Promise<PaymentPlan[]> => {
  const products = await payment(ctx).products()
  const plans: PaymentPlan[] = []
  for (const product of products) {
    plans.push(...await payment(ctx).allPlans(product.sku) as PaymentPlan[])
  }

  return plans
}

/** The declared free plan an entity falls back to: the lowest rank, then the sku. */
export const freePlanOf = async (ctx: ApiContext): Promise<PaymentPlan | null> =>
  (await catalogPlans(ctx))
    .filter(plan => plan.free === true)
    .sort((a, b) => planRank(a) - planRank(b) || a.sku.localeCompare(b.sku))[0] ?? null

/** An internal grant with a period end stops entitling at that instant; a paygate row never does. */
const stillEntitles = (row: PaymentSubscriptionRecord, at: Date): boolean =>
  row.paygate !== INTERNAL_PAYGATE || row.periodEnd == null || new Date(row.periodEnd).getTime() > at.getTime()

const unknownPlans = new Set<string>()

/**
 * The plan an entity holds: its highest-ranked subscription in an entitling status (the catalogue
 * rank, the stored one for a plan the catalogue no longer declares; the newest first on a tie),
 * else the declared free plan.
 *
 * @throws PlanRequired when there is neither.
 */
export const resolveEffectivePlan = async (
  ctx: ApiContext, entityId: string, at: Date = new Date(),
): Promise<EffectivePlan> => {
  const fallback = await freePlanOf(ctx)
  const { items } = await subscriptions(ctx).list(
    { entityId, status: [...ENTITLING_STATUSES] }, { size: 0 },
  )
  const candidates: Array<{ plan: PaymentPlan, row: PaymentSubscriptionRecord, rank: number }> = []
  for (const row of items.filter(item => stillEntitles(item, at))) {
    const plan = await findPlan(ctx, row.planSku)
    if (plan == null) {
      if (!unknownPlans.has(row.planSku)) {
        unknownPlans.add(row.planSku)
        console.warn(`[payment] subscription "${row.externalId}" names unknown plan "${row.planSku}"; ignored`)
      }
      continue
    }
    candidates.push({ plan, row, rank: planRank(plan) })
  }
  candidates.sort((a, b) => b.rank - a.rank
    || new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime())

  const best = candidates[0]
  if (best != null) {
    return { plan: best.plan, subscription: best.row, fallback }
  }
  if (fallback != null) {
    return { plan: fallback, subscription: null, fallback }
  }

  throw new PlanRequired(entityId)
}
