import type { Workcard } from '@owlmeans/planning'
import type { PlanningCardRecord } from '../../types.js'

/** The card table's own statements over one runner — the pool, or a fold's open transaction. */
export interface CardSqlHelper {
  /** A card row with its private bookkeeping (what the fold reads), or `null`. */
  readCardRow: (id: string, entityId?: string) => Promise<PlanningCardRecord | null>
  readCard: (id: string, entityId: string) => Promise<Workcard | null>
  /**
   * Write a folded card whole. `head` is never lowered — an allocation made while the fold ran stays
   * — and `headAt` is never touched.
   *
   * A create (`seq` 1) is an upsert. Anything later is an UPDATE of a row that must still exist: a
   * card purged with its project while one of its own transitions was folding is not resurrected.
   *
   * @throws {PlanningPostgresError} `fold:card-vanished:<id>`
   */
  writeCard: (card: Workcard) => Promise<void>
  dropCard: (id: string, entityId: string) => Promise<void>
}
