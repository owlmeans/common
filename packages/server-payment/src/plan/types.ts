import type { ProductPlan } from '@owlmeans/payment'
import type { PaymentPlan, PaymentProduct, PaymentSubscriptionRecord } from '../types.js'

/** What a plan declaration says on its own — no context, no store. */
export interface PlanHelper {
  /** A plan's rank; an absent rank reads as `0`. */
  planRank: (plan: Pick<ProductPlan, 'rank'>) => number
  /**
   * A plan as ONE subscription holds it: the row's `overrides` replace the static declaration.
   *
   * A limit override sets the ceiling of a key the plan declares and drops that key's promo, so the
   * ceiling holds whatever the promo says; the kind and the window stay the plan's, because the
   * counters are keyed by them. A key the plan does not declare, or a ceiling that is not a safe
   * integer `>= 0`, is ignored. The override belongs to the row: it follows the subscription through
   * a plan change and ends with it.
   */
  overriddenPlan: (plan: PaymentPlan, row: Pick<PaymentSubscriptionRecord, 'overrides'> | null | undefined) => PaymentPlan
  planLookupKey: (product: PaymentProduct, plan: PaymentPlan) => string
  /** Whether a plan is sold through a paygate: never a free plan; otherwise its own gateways, else the product's. */
  isSoldThrough: (product: PaymentProduct, plan: PaymentPlan, paygate: string) => boolean
}
