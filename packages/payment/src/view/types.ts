import type {
  CapabilityView, EntitlementPlanView, EntitlementView, LimitUsage, LimitView, ProductPlan,
} from '../types.js'

/** The entitlement view of a plan — its capability and limit rows — and its wire reviver. */
export interface EntitlementViewHelper {
  /**
   * One row per granted permission of a plan's capability sets.
   *
   * A `null`/`false` value is not a grant and is not listed. A set whose promo is no longer in force
   * is still listed — `granted: false`, `promo.active: false` — so a UI can say the promotion ended.
   * A set under the reserved `limit` scope is never a capability and is skipped.
   */
  capabilityViewsOf: (plan: Pick<ProductPlan, 'capabilities'>, subscribedAt?: Date | null, at?: Date) => CapabilityView[]
  /**
   * One row per declared limit, in declaration order.
   *
   * `used` comes from the usage row of the limit's CURRENT window (none ⇒ `0`); a lapsed promo makes
   * the limit `0`; `remaining` never goes below `0`; `windowStart`/`resetsAt` exist only for a
   * window limit.
   */
  limitViewsOf: (
    plan: Pick<ProductPlan, 'limits'>, usage: LimitUsage[], subscribedAt?: Date | null, at?: Date,
  ) => LimitView[]
  /**
   * The full entitlement view of one effective plan.
   *
   * Promos are measured against `planView.subscribedAt` — leave it unset for an entity with no
   * subscription row, and no promo is grandfathered.
   */
  entitlementViewOf: (
    plan: ProductPlan, planView: EntitlementPlanView, usage: LimitUsage[], at?: Date,
  ) => EntitlementView
  /**
   * An `EntitlementView` as the WIRE carries it — every date an ISO string — turned back into the
   * typed shape with `Date` instances. Idempotent: a view that already holds dates is copied as is.
   */
  reviveEntitlementView: (view: EntitlementView) => EntitlementView
}
