import type { LimitView } from '@owlmeans/payment'
import type { PaymentGrantRecord, PaymentPlan } from '../types.js'

/** The units of a limit's grants, summed. */
export interface GrantUnits {
  /** Σ `amount`. */
  amount: number
  /** Σ `used`. */
  used: number
}

/**
 * How entitlement grants fold into what a plan answers — pure, no store. Every member takes the
 * grants IN FORCE (read through `inForceAt`); a revoked or ended grant must not reach them.
 */
export interface GrantFoldHelper {
  /** Whether a grant is in force at `at`: `active`, started (`startsAt <= at`), not ended (`endsAt > at`, or none). */
  inForceAt: (grant: PaymentGrantRecord, at: Date) => boolean
  /**
   * The units grants of one limit among `grants`, in the order they are consumed: the earliest end
   * first (a grant without an end last), then the oldest.
   */
  unitsOf: (grants: readonly PaymentGrantRecord[], limitKey: string) => PaymentGrantRecord[]
  /** Σ amount and Σ used of units grants (already narrowed to one limit). */
  unitsFold: (units: readonly PaymentGrantRecord[]) => GrantUnits
  /**
   * One limit's view with the units grants of its key folded into its numbers: `limit` + Σ amount,
   * `used` + Σ used, `remaining = max(0, limit - used)`. The same view when none applies.
   */
  foldLimitView: (view: LimitView, grants: readonly PaymentGrantRecord[]) => LimitView
  /**
   * A plan with the granted capabilities merged into its capabilities — those of `capability`
   * grants and the one a `units` grant may carry: each granted parameter becomes
   * a set of its own, without a promo, replacing the plan's entry of the same permission unless the
   * plan already grants it unconditionally. The same plan when none applies.
   */
  withCapabilities: (plan: PaymentPlan, grants: readonly PaymentGrantRecord[]) => PaymentPlan
  /** The usage window a unit held on a grant is written under: `grant:<grantId>`. */
  windowOf: (grantId: string) => string
  /** The grant id of a `grant:<id>` window; `null` for any other window. */
  grantIdOf: (window: string | null | undefined) => string | null
}
