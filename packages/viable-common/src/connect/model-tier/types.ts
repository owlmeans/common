import type { ModelTier } from '../consts.js'

/** Which model tier a platform role runs on, and how a tier is placed on what a parent offers. */
export interface ModelTierHelper {
  /** The tier a platform role asks for; a role the table does not name is `Standard`. */
  tierOfRole: (role: string) => ModelTier
  /**
   * Pick the best tier a parent actually offers, never below what was asked for by more than the
   * offer allows.
   *
   * A parent that offers only one model answers every task with it; a parent that offers two gets
   * the nearer of the two. Silence is not an option — a task the connector cannot place is a run
   * that stops.
   */
  clampTier: (wanted: ModelTier, offered: ModelTier[]) => ModelTier
}
