import type { Config, PaymentPlan } from '../../types.js'

/** The plans a configuration declares, and the rules no single declaration can check. */
export interface PlanDeclarationsModel {
  readonly record: Config
  /** Every plan declared into the configuration. */
  plans: () => PaymentPlan[]
  /**
   * Cross-plan rules a single declaration cannot see:
   *
   * - at most one free plan per rank;
   * - no two paid plans of one product at the same rank (one-time `consumable` plans are never an
   *   entity's plan and are not ranked against each other).
   *
   * A limit key MAY change kind between plans (lifetime on one, a monthly window on another): counters
   * are keyed by `(entity, key, window)` and the window is derived from the kind, so each kind keeps its
   * own counter and a lifetime count still sticks to the entity across plan changes.
   *
   * @throws PlanRankConflict
   */
  assertPlans: () => void
}
