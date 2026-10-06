import type { Relationship, Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import type { PlanningStores, SyncOptions } from '../types.js'

/** An authoritative list made true in one mirror store — within a scope, never beyond it. */
export interface SyncHelper {
  /**
   * Make the store agree with an authoritative list WITHIN a scope: every card given is written
   * (unless the store holds a newer fold of it), and every card matching `where` that the list does
   * not name is dropped. Cards outside `where` are left alone — which is why this, and never
   * `replace()`, is how a list reaches the one shared card store.
   *
   * Unchanged cards are not rewritten, so a periodic re-seed wakes no subscriber.
   */
  syncCards: (store: PlanningStores['cards'], items: Workcard[], where?: Criteria<Workcard>, opts?: SyncOptions) => Promise<void>
  /** {@link SyncHelper.syncCards} for the link store. */
  syncLinks: (store: PlanningStores['links'], items: Relationship[], where?: Criteria<Relationship>, opts?: SyncOptions) => Promise<void>
}
