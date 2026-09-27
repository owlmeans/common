import { SubscriptionStatus, capabilityOf, hasLimitRoom } from '@owlmeans/payment'
import type { EntitlementPlanView, EntitlementView, LimitView, PromoView } from '@owlmeans/payment'
import type { LimitStatus, PlanStatusLine, PlanStatusLineKind, PromoInscription } from './types.js'

/**
 * Whether a view grants a capability parameter — `null` while the view is not known, so a caller
 * renders the paid control disabled instead of enabled-then-refused.
 */
export const capabilityStateOf = (
  view: EntitlementView | null | undefined, param: string,
): boolean | null => view == null ? null : capabilityOf(view, param)

/** A limit row with `exhausted` and a clamped `ratio`; `null` for no row. */
export const limitStatusOf = (limit: LimitView | null | undefined): LimitStatus | null => {
  if (limit == null) {
    return null
  }
  const used = Number.isFinite(limit.used) ? Math.max(0, limit.used) : 0
  const ratio = limit.limit > 0 ? Math.min(1, used / limit.limit) : used > 0 ? 1 : 0

  return { ...limit, exhausted: !hasLimitRoom(limit), ratio }
}

const INACTIVE: Partial<Record<SubscriptionStatus, PlanStatusLineKind>> = {
  [SubscriptionStatus.Created]: 'created',
  [SubscriptionStatus.Canceled]: 'canceled',
  [SubscriptionStatus.Expired]: 'expired',
  [SubscriptionStatus.Ended]: 'ended',
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

/**
 * The one status line a plan view earns — first match wins: inactive and blocked statuses, paused
 * (a pause date), suspended, trial, past due, cancellation scheduled, free, renews (a period end),
 * active.
 */
export const planStatusLineOf = (plan: EntitlementPlanView): PlanStatusLine => {
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

/** How to inscribe a promo; `null` when the grant has none. */
export const promoInscriptionOf = (promo: PromoView | null | undefined): PromoInscription | null => {
  if (promo == null) {
    return null
  }
  if (!promo.active) {
    return 'ended'
  }

  return promo.grandfathered ? 'grandfathered' : 'free-until'
}
