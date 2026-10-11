import type { Relationship, Transition, Workcard } from '../../types.js'

/** The pure fold — the card and its edges after one transition. */
export interface ApplyHelper {
  /**
   * THE fold: the card after one transition. Pure, total, no I/O — every store (memory, Mongo, a
   * client mirror) folds with this and nothing else, so one log always means one card.
   *
   * - An already-applied transition (`seq <= card.seq`) returns the card unchanged: re-folding is
   *   safe.
   * - Anything but the next seq (`card.seq + 1`, or 1 for a create with no card) is refused with
   *   `PlanningError('fold:out-of-order')`.
   * - The log is replayed as written: a transition the executor would refuse today (an update naming
   *   `createdBy`, appended before that refusal existed) still folds. Guards live at admission.
   * - `create` builds the whole record from `changes` plus the transition's identity; `delete`
   *   answers `null`; `link`/`unlink` only move `seq`/`head`/`updatedAt` (the edges are
   *   {@link ApplyHelper.applyRelationship}'s); `update`/`transit` write `changes` — `fields` and
   *   `flows` merge, everything else replaces — and clear `unset`.
   * - Every result has `seq = transition.seq`, `head = max(head, seq)`, `updatedAt = transition.at`.
   *
   * @throws {PlanningError} `planning:fold:out-of-order:…`
   */
  applyTransition: <T extends Workcard = Workcard>(card: T | null | undefined, transition: Transition) => T | null
  /**
   * The relationships after one transition. Pure and total, like {@link ApplyHelper.applyTransition}.
   *
   * `create` adds its `links`, `link` adds its `link`, `unlink` removes the matching edge, and a
   * `delete` removes every edge touching the card. An edge that already exists is kept as it is, so
   * re-folding adds nothing. Every other action answers the list unchanged. Always a new array.
   */
  applyRelationship: (links: Relationship[], transition: Transition) => Relationship[]
}
