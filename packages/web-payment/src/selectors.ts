import { SubscriptionStatus, planLimitHelper, type EntitlementPlanView, type EntitlementView, type LimitView, type PromoView } from '@owlmeans/payment'
import type { LimitStatus, PlanStatusLine, PlanStatusLineKind, PromoInscription } from './types.js'
import { INACTIVE } from './consts.local.js'
import type { EntitlementSelectorHelper } from './selectors/types.js'

export const createEntitlementSelectorHelper = (): EntitlementSelectorHelper => {
  const capabilityStateOf = (
    view: EntitlementView | null | undefined, param: string,
  ): boolean | null => view == null ? null : planLimitHelper.capabilityOf(view, param)

  const limitStatusOf = (limit: LimitView | null | undefined): LimitStatus | null => {
    if (limit == null) {
      return null
    }
    const used = Number.isFinite(limit.used) ? Math.max(0, limit.used) : 0
    const ratio = limit.limit > 0 ? Math.min(1, used / limit.limit) : used > 0 ? 1 : 0

    return { ...limit, exhausted: !planLimitHelper.hasLimitRoom(limit), ratio }
  }

  const dateOf = (value: Date | string | null | undefined): Date | undefined => {
    if (value == null) {
      return undefined
    }
    const date = value instanceof Date ? value : new Date(value)

    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const line = (kind: PlanStatusLineKind, tone: PlanStatusLine['tone'], date?: Date): PlanStatusLine =>
    date == null ? { kind, tone } : { kind, tone, date }

  const planStatusLineOf = (plan: EntitlementPlanView): PlanStatusLine => {
    const inactive = INACTIVE[plan.status]
    if (inactive != null) {
      return line(inactive, 'inactive')
    }
    if (plan.status === SubscriptionStatus.Blocked) {
      return line('blocked', 'critical')
    }
    const pausedAt = dateOf(plan.pausedAt)
    if (pausedAt != null) {
      return line('paused', 'warning', pausedAt)
    }
    if (plan.status === SubscriptionStatus.Suspended) {
      return line('suspended', 'critical')
    }
    if (plan.status === SubscriptionStatus.Trial) {
      return line('trial', 'ok', dateOf(plan.trialEnd))
    }
    if (plan.pastDue === true || plan.status === SubscriptionStatus.PastDue) {
      return line('past-due', 'warning')
    }
    const periodEnd = dateOf(plan.periodEnd)
    if (plan.cancelAtPeriodEnd === true) {
      return line('cancel-scheduled', 'warning', periodEnd)
    }
    if (plan.free) {
      return line('free', 'ok')
    }
    if (periodEnd != null) {
      return line('renews', 'ok', periodEnd)
    }

    return line('active', 'ok')
  }

  const promoInscriptionOf = (promo: PromoView | null | undefined): PromoInscription | null => {
    if (promo == null) {
      return null
    }
    if (!promo.active) {
      return 'ended'
    }

    return promo.grandfathered ? 'grandfathered' : 'free-until'
  }

  return { capabilityStateOf, limitStatusOf, planStatusLineOf, promoInscriptionOf }
}

export const entitlementSelectorHelper = createEntitlementSelectorHelper()

/** @deprecated compat:factory-refactor — use `entitlementSelectorHelper.capabilityStateOf(…)` */
export const capabilityStateOf = (view: EntitlementView | null | undefined, param: string): boolean | null =>
  entitlementSelectorHelper.capabilityStateOf(view, param)

/** @deprecated compat:factory-refactor — use `entitlementSelectorHelper.limitStatusOf(…)` */
export const limitStatusOf = (limit: LimitView | null | undefined): LimitStatus | null =>
  entitlementSelectorHelper.limitStatusOf(limit)

/** @deprecated compat:factory-refactor — use `entitlementSelectorHelper.planStatusLineOf(…)` */
export const planStatusLineOf = (plan: EntitlementPlanView): PlanStatusLine => entitlementSelectorHelper.planStatusLineOf(plan)

/** @deprecated compat:factory-refactor — use `entitlementSelectorHelper.promoInscriptionOf(…)` */
export const promoInscriptionOf = (promo: PromoView | null | undefined): PromoInscription | null =>
  entitlementSelectorHelper.promoInscriptionOf(promo)
