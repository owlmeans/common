import type { EntitlementPlanView, EntitlementView, LimitView, PromoView } from '@owlmeans/payment'
import type { LimitStatus, PlanStatusLine, PromoInscription } from '../types.js'

/** What a UI reads off an entitlement view: capabilities, limit rows, the plan's status line, promos. */
export interface EntitlementSelectorHelper {
  /**
   * Whether a view grants a capability parameter — `null` while the view is not known, so a caller
   * renders the paid control disabled instead of enabled-then-refused.
   */
  capabilityStateOf: (view: EntitlementView | null | undefined, param: string) => boolean | null
  /** A limit row with `exhausted` and a clamped `ratio`; `null` for no row. */
  limitStatusOf: (limit: LimitView | null | undefined) => LimitStatus | null
  /**
   * The one status line a plan view earns — first match wins: inactive and blocked statuses, paused
   * (a pause date), suspended, trial, past due, cancellation scheduled, free, renews (a period end),
   * active.
   */
  planStatusLineOf: (plan: EntitlementPlanView) => PlanStatusLine
  /** How to inscribe a promo; `null` when the grant has none. */
  promoInscriptionOf: (promo: PromoView | null | undefined) => PromoInscription | null
}
