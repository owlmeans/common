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

const isCeiling = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/**
 * A plan as ONE subscription holds it: the row's `overrides` replace the static declaration.
 *
 * A limit override sets the ceiling of a key the plan declares and drops that key's promo, so the
 * ceiling holds whatever the promo says; the kind and the window stay the plan's, because the
 * counters are keyed by them. A key the plan does not declare, or a ceiling that is not a safe
 * integer `>= 0`, is ignored. The override belongs to the row: it follows the subscription through
 * a plan change and ends with it.
 */
export const overriddenPlan = (
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

/** An internal grant with a period end stops entitling at that instant; a paygate row never does. */
const stillEntitles = (row: PaymentSubscriptionRecord, at: Date): boolean =>
  row.paygate !== INTERNAL_PAYGATE || row.periodEnd == null || new Date(row.periodEnd).getTime() > at.getTime()

const unknownPlans = new Set<string>()

/**
 * The plan an entity holds: its highest-ranked subscription in an entitling status (the catalogue
 * rank, the stored one for a plan the catalogue no longer declares; the newest first on a tie),
 * else the declared free plan. The plan answered carries the winning row's `overrides`
 * (`overriddenPlan`), so every reader — ceilings, the view, the gates — sees one answer.
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
    return { plan: overriddenPlan(best.plan, best.row), subscription: best.row, fallback }
  }
  if (fallback != null) {
    return { plan: fallback, subscription: null, fallback }
  }

  throw new PlanRequired(entityId)
}
