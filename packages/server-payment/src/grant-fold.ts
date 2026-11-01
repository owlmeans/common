import type { LimitView, PlanCapability } from '@owlmeans/payment'
import { CAPABILITY_LIMIT_SCOPE, entitlementParamHelper } from '@owlmeans/payment'
import { EntitlementGrantKind, EntitlementGrantStatus, GRANT_WINDOW_PREFIX } from './consts.js'
import type { PaymentGrantRecord, PaymentPlan } from './types.js'
import type { GrantFoldHelper, GrantUnits } from './grant-fold/types.js'

const timeOf = (value: Date | string | null | undefined): number | null =>
  value == null ? null : new Date(value).getTime()

const count = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0

export const createGrantFoldHelper = (): GrantFoldHelper => {
  const inForceAt = (grant: PaymentGrantRecord, at: Date): boolean => {
    if (grant.status !== EntitlementGrantStatus.Active) {
      return false
    }
    const now = at.getTime()
    const starts = timeOf(grant.startsAt)
    const ends = timeOf(grant.endsAt)

    return (starts == null || starts <= now) && (ends == null || ends > now)
  }

  const unitsOf = (grants: readonly PaymentGrantRecord[], limitKey: string): PaymentGrantRecord[] =>
    grants.filter(grant => grant.kind === EntitlementGrantKind.Units && grant.limitKey === limitKey
      && count(grant.amount) > 0)
      .sort((a, b) => (timeOf(a.endsAt) ?? Number.POSITIVE_INFINITY) - (timeOf(b.endsAt) ?? Number.POSITIVE_INFINITY)
        || (timeOf(a.createdAt) ?? 0) - (timeOf(b.createdAt) ?? 0))

  const unitsFold = (units: readonly PaymentGrantRecord[]): GrantUnits => units.reduce<GrantUnits>(
    (sum, grant) => ({ amount: sum.amount + count(grant.amount), used: sum.used + count(grant.used) }),
    { amount: 0, used: 0 },
  )

  const foldLimitView = (view: LimitView, grants: readonly PaymentGrantRecord[]): LimitView => {
    const units = unitsOf(grants, view.key)
    if (units.length === 0) {
      return view
    }
    const fold = unitsFold(units)
    const limit = view.limit + fold.amount
    const used = view.used + fold.used

    return { ...view, limit, used, remaining: Math.max(0, limit - used) }
  }

  /** Whether a held capability value answers a granted one: any flag for `true`, at least as much for a number. */
  const covers = (held: unknown, value: true | number): boolean =>
    value === true ? held != null && held !== false : typeof held === 'number' && held >= value

  const withCapabilities = (plan: PaymentPlan, grants: readonly PaymentGrantRecord[]): PaymentPlan => {
    // A capability grant, or a units grant carrying the capability its units need.
    const granted = grants.filter(grant => typeof grant.capability === 'string' && grant.capability !== '')
    if (granted.length === 0) {
      return plan
    }
    let capabilities: PlanCapability[] = [...(plan.capabilities ?? [])]
    for (const grant of granted) {
      const { scope, permission, atLeast } = entitlementParamHelper.parseEntitlementParam(grant.capability!)
      if (scope == null || scope === '' || permission === '' || scope === CAPABILITY_LIMIT_SCOPE) {
        continue
      }
      const value: true | number = atLeast ?? true
      const covered = capabilities.some(set => set.scope === scope && set.promo == null
        && covers(set.permissions?.[permission], value))
      if (covered) {
        continue
      }
      // The grant's row replaces the plan's (a promo's, or a smaller magnitude): one row per permission.
      capabilities = capabilities.map(set => set.scope !== scope || set.permissions?.[permission] == null ? set : {
        ...set, permissions: Object.fromEntries(Object.entries(set.permissions).filter(([key]) => key !== permission)),
      })
      capabilities.push({ scope, permissions: { [permission]: value } })
    }

    return { ...plan, capabilities }
  }

  const windowOf = (grantId: string): string => `${GRANT_WINDOW_PREFIX}${grantId}`

  const grantIdOf = (window: string | null | undefined): string | null =>
    typeof window === 'string' && window.startsWith(GRANT_WINDOW_PREFIX) && window.length > GRANT_WINDOW_PREFIX.length
      ? window.slice(GRANT_WINDOW_PREFIX.length) : null

  return { inForceAt, unitsOf, unitsFold, foldLimitView, withCapabilities, windowOf, grantIdOf }
}

export const grantFoldHelper = createGrantFoldHelper()
