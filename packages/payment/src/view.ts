import { LimitKind, CAPABILITY_LIMIT_SCOPE } from './consts.js'
import { entitlementParamHelper } from './entitlement.js'
import { planLimitHelper } from './limit.js'
import { promoHelper } from './promo.js'
import type {
  CapabilityView, EntitlementPlanView, EntitlementView, LimitUsage, LimitView, ProductPlan,
} from './types.js'
import { LIMIT_DATES, PLAN_DATES } from './consts.local.js'
import type { Dated } from './types.local.js'
import type { EntitlementViewHelper } from './view/types.js'

export const createEntitlementViewHelper = (): EntitlementViewHelper => {
  const capabilityViewsOf = (
    plan: Pick<ProductPlan, 'capabilities'>,
    subscribedAt?: Date | null,
    at: Date = new Date(),
  ): CapabilityView[] => {
    const views: CapabilityView[] = []
    for (const set of plan.capabilities ?? []) {
      if (set.scope === CAPABILITY_LIMIT_SCOPE) {
        continue
      }
      const granted = promoHelper.promoActive(set.promo, subscribedAt, at)
      const promo = promoHelper.promoViewOf(set.promo, subscribedAt, at)
      for (const [permission, value] of Object.entries(set.permissions ?? {})) {
        if (value == null || value === false) {
          continue
        }
        views.push({
          param: entitlementParamHelper.formatEntitlementParam({ scope: set.scope, permission }),
          scope: set.scope, permission, value, granted,
          ...(promo != null ? { promo } : {}),
        })
      }
    }

    return views
  }

  const limitViewsOf = (
    plan: Pick<ProductPlan, 'limits'>,
    usage: LimitUsage[],
    subscribedAt?: Date | null,
    at: Date = new Date(),
  ): LimitView[] => Object.entries(plan.limits ?? {}).map(([key, declaration]) => {
    const window = planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at, subscribedAt ?? at)
    const used = Math.max(0, usage.find(row => row.key === key && row.window === window)?.used ?? 0)
    const limit = promoHelper.promoActive(declaration.promo, subscribedAt, at) ? declaration.limit : 0
    const promo = promoHelper.promoViewOf(declaration.promo, subscribedAt, at)
    const bounds = declaration.kind === LimitKind.Window && declaration.window != null
      ? planLimitHelper.windowBoundsOf(declaration.window, at, subscribedAt ?? at) : null

    return {
      key, param: planLimitHelper.formatLimitParam(key), kind: declaration.kind,
      ...(declaration.kind === LimitKind.Window ? { window: declaration.window } : {}),
      limit, used, remaining: Math.max(0, limit - used),
      ...(bounds != null ? { windowStart: bounds.start, resetsAt: bounds.resetsAt } : {}),
      ...(declaration.unit != null ? { unit: declaration.unit } : {}),
      ...(promo != null ? { promo } : {}),
    }
  })

  const entitlementViewOf = (
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

  const reviveEntitlementView = (view: EntitlementView): EntitlementView => ({
    plan: revive(view.plan as unknown as Dated, PLAN_DATES) as unknown as EntitlementPlanView,
    capabilities: view.capabilities.map(revivePromo),
    limits: view.limits.map(limit => revivePromo(revive(limit as unknown as Dated, LIMIT_DATES) as unknown as LimitView)),
    at: view.at instanceof Date ? view.at : new Date(view.at),
  })

  return { capabilityViewsOf, limitViewsOf, entitlementViewOf, reviveEntitlementView }
}

export const entitlementViewHelper = createEntitlementViewHelper()

/** @deprecated compat:factory-refactor — use `entitlementViewHelper.capabilityViewsOf(…)` */
export const capabilityViewsOf = (
  plan: Pick<ProductPlan, 'capabilities'>, subscribedAt?: Date | null, at?: Date,
): CapabilityView[] => entitlementViewHelper.capabilityViewsOf(plan, subscribedAt, at)

/** @deprecated compat:factory-refactor — use `entitlementViewHelper.limitViewsOf(…)` */
export const limitViewsOf = (
  plan: Pick<ProductPlan, 'limits'>, usage: LimitUsage[], subscribedAt?: Date | null, at?: Date,
): LimitView[] => entitlementViewHelper.limitViewsOf(plan, usage, subscribedAt, at)

/** @deprecated compat:factory-refactor — use `entitlementViewHelper.entitlementViewOf(…)` */
export const entitlementViewOf = (
  plan: ProductPlan, planView: EntitlementPlanView, usage: LimitUsage[], at?: Date,
): EntitlementView => entitlementViewHelper.entitlementViewOf(plan, planView, usage, at)

/** @deprecated compat:factory-refactor — use `entitlementViewHelper.reviveEntitlementView(…)` */
export const reviveEntitlementView = (view: EntitlementView): EntitlementView =>
  entitlementViewHelper.reviveEntitlementView(view)
