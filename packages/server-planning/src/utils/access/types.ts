import type { Workcard } from '@owlmeans/planning'
import type { PlanningAccess, PlanningAccessGrants } from '../../types.js'

/** The write rules of one resolved {@link PlanningAccess} — no access at all gates nothing. */
export interface PlanningAccessModel {
  readonly record: PlanningAccess | undefined
  /**
   * Refuse a write the access does not grant. No access, or access without `grants`, gates nothing;
   * a `grants` object refuses every flag it leaves out. `true` grants everything; a list grants the
   * project ids it names — `target` is the project the write is about (`undefined` for the
   * organization's root, which only `true` reaches).
   *
   * @throws {PlanningForbidden}
   */
  assertGranted: (grant: keyof PlanningAccessGrants, target?: string) => void
  /**
   * A card the access's `writes` admits — the rule a narrowed read admits, over `writes`: a project
   * it names, or a card whose `parents` name one. A specification is admitted through its parent card
   * by the caller. No `writes` admits everything.
   */
  writableIn: (card: Pick<Workcard, 'id' | 'parents'>) => boolean
  /**
   * Refuse a write into a project the access's `writes` leaves out. No `writes` refuses nothing;
   * `target` is the project the write is in (`undefined` for the organization's root, which a set
   * `writes` never admits).
   *
   * @throws {PlanningForbidden}
   */
  assertWrites: (target?: string) => void
}
