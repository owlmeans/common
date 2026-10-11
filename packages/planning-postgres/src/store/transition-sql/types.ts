import type { Transition, TransitionCommit, TransitionWhere } from '@owlmeans/planning'
import type { ListResult } from '@owlmeans/resource'

/** The log's own statements over one runner — so they run inside a fold's transaction. */
export interface TransitionSqlHelper {
  transitionOf: (row: Record<string, unknown>) => Transition
  readTransition: (id: string) => Promise<Transition | null>
  readTransitionByKey: (entityId: string, key: string) => Promise<Transition | null>
  /**
   * The log of one card (or several) in `seq` order, as a fold reads it: this package's own statement,
   * so it runs inside a fold's transaction. `size` bounds it (0 is no limit); `total` tells a bounded
   * read that more remain.
   */
  listTransitions: (where: TransitionWhere, size?: number) => Promise<ListResult<Transition>>
  commitTransition: (id: string, commit: TransitionCommit) => Promise<void>
  /**
   * Allocate the next seq — a compare-and-set of `head` on the card row, stamping `headAt`. A card
   * whose create has not folded yet has no row to count on: it allocates `max(seq) + 1` from the log
   * and lets the unique `(card, seq)` index refuse a repeat.
   *
   * @throws {WorkcardConflict}
   */
  allocateSeq: (card: string, expect: number | null | undefined, at: string) => Promise<number>
  lastSeq: (card: string) => Promise<number>
}
