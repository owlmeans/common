import { LimitKind } from './consts.js'
import { CAPABILITY_LIMIT_SCOPE, formatEntitlementParam } from './entitlement.js'
import { formatLimitParam, windowBoundsOf, windowKeyOf } from './limit.js'
import { promoActive, promoViewOf } from './promo.js'
import type {
  CapabilityView, EntitlementPlanView, EntitlementView, LimitUsage, LimitView, ProductPlan,
} from './types.js'

/**
 * One row per granted permission of a plan's capability sets.
 *
 * A `null`/`false` value is not a grant and is not listed. A set whose promo is no longer in force
 * is still listed — `granted: false`, `promo.active: false` — so a UI can say the promotion ended.
 * A set under the reserved `limit` scope is never a capability and is skipped.
 */
export const capabilityViewsOf = (
  plan: Pick<ProductPlan, 'capabilities'>,
  subscribedAt?: Date | null,
  at: Date = new Date(),
): CapabilityView[] => {
  const views: CapabilityView[] = []
  for (const set of plan.capabilities ?? []) {
    if (set.scope === CAPABILITY_LIMIT_SCOPE) {
      continue
    }
    const granted = promoActive(set.promo, subscribedAt, at)
    const promo = promoViewOf(set.promo, subscribedAt, at)
    for (const [permission, value] of Object.entries(set.permissions ?? {})) {
      if (value == null || value === false) {
        continue
      }
      views.push({
        param: formatEntitlementParam({ scope: set.scope, permission }),
        scope: set.scope, permission, value, granted,
        ...(promo != null ? { promo } : {}),
      })
    }
  }

  return views
}

/**
 * One row per declared limit, in declaration order.
 *
 * `used` comes from the usage row of the limit's CURRENT window (none ⇒ `0`); a lapsed promo makes
 * the limit `0`; `remaining` never goes below `0`; `windowStart`/`resetsAt` exist only for a
 * window limit.
 */
export const limitViewsOf = (
  plan: Pick<ProductPlan, 'limits'>,
  usage: LimitUsage[],
  subscribedAt?: Date | null,
  at: Date = new Date(),
): LimitView[] => Object.entries(plan.limits ?? {}).map(([key, declaration]) => {
  const window = windowKeyOf(declaration.kind, declaration.window, at)
  const used = Math.max(0, usage.find(row => row.key === key && row.window === window)?.used ?? 0)
  const limit = promoActive(declaration.promo, subscribedAt, at) ? declaration.limit : 0
  const promo = promoViewOf(declaration.promo, subscribedAt, at)
  const bounds = declaration.kind === LimitKind.Window && declaration.window != null
    ? windowBoundsOf(declaration.window, at) : null

  return {
    key, param: formatLimitParam(key), kind: declaration.kind,
    ...(declaration.kind === LimitKind.Window ? { window: declaration.window } : {}),
    limit, used, remaining: Math.max(0, limit - used),
    ...(bounds != null ? { windowStart: bounds.start, resetsAt: bounds.resetsAt } : {}),
    ...(declaration.unit != null ? { unit: declaration.unit } : {}),
    ...(promo != null ? { promo } : {}),
  }
})

/**
 * The full entitlement view of one effective plan.
 *
 * Promos are measured against `planView.subscribedAt` — leave it unset for an entity with no
 * subscription row, and no promo is grandfathered.
 */
export const entitlementViewOf = (
  plan: ProductPlan,
  planView: EntitlementPlanView,
  usage: LimitUsage[],
  at: Date = new Date(),
): EntitlementView => ({
  plan: planView,
  capabilities: capabilityViewsOf(plan, planView.subscribedAt, at),
  limits: limitViewsOf(plan, usage, planView.subscribedAt, at),
  at,
})

const PLAN_DATES = ['subscribedAt', 'periodStart', 'periodEnd', 'trialEnd', 'pausedAt'] as const
const LIMIT_DATES = ['windowStart', 'resetsAt'] as const

type Dated = Record<string, unknown>

const revive = <T extends Dated>(value: T, fields: readonly string[]): T => {
  const copy: Dated = { ...value }
  for (const field of fields) {
    const raw = copy[field]
    if (raw != null && !(raw instanceof Date)) {
      copy[field] = new Date(raw as string)
    }
  }

  return copy as T
}

const revivePromo = <T extends { promo?: unknown }>(row: T): T =>
  row.promo == null ? row : { ...row, promo: revive(row.promo as Dated, ['until']) }

/**
 * An `EntitlementView` as the WIRE carries it — every date an ISO string — turned back into the
 * typed shape with `Date` instances. Idempotent: a view that already holds dates is copied as is.
 */
export const reviveEntitlementView = (view: EntitlementView): EntitlementView => ({
  plan: revive(view.plan as unknown as Dated, PLAN_DATES) as unknown as EntitlementPlanView,
  capabilities: view.capabilities.map(revivePromo),
  limits: view.limits.map(limit => revivePromo(revive(limit as unknown as Dated, LIMIT_DATES) as unknown as LimitView)),
  at: view.at instanceof Date ? view.at : new Date(view.at),
})
