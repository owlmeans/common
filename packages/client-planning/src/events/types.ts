import type { CommitEvent, PlanningFacade, TransitionReceiptView, Workcard } from '@owlmeans/planning'
import type { PlanningClientLifecycle, PlanningOperation } from '../lifecycle/types.js'

export interface PlanningMirrorOptions {
  lifecycle: PlanningClientLifecycle
  operation: PlanningOperation
}

/** What one set of mirror stores learns from the server: commit frames, receipts and cards read. */
export interface PlanningMirror {
  /**
   * Fold one commit frame into the mirror.
   *
   * - An OLDER `seq` never overwrites a newer record — frames and list answers race.
   * - A committed `delete` REMOVES the row and every link touching it (and, for a project, the rows
   *   under it — the server purged them in the same fold).
   * - A frame for an id the store never saw still writes a row: a card created in another tab
   *   appears here without waiting for the next list.
   * - A `failed` commit leaves the card alone; the reason is recorded in the commit store.
   *
   * A frame from a cross-process bus carries ids only. When `record` is absent the card is re-read
   * through `facade`; without one there is nothing to write but the commit itself.
   */
  applyCommitEvent: (event: CommitEvent, facade?: PlanningFacade, options?: PlanningMirrorOptions) => Promise<void>
  /**
   * Mark a receipt in the mirror the moment the server answers it.
   *
   * A pending transition raises the card's `head` to its `seq`, so `head > seq` — the model's
   * `pending()` — is true before any frame arrives. A receipt that already carries the committed
   * card writes it; a committed delete drops the row.
   */
  applyReceipt: (receipt: TransitionReceiptView, options?: PlanningMirrorOptions) => Promise<void>
  /** Write cards the caller read on its own, under the same newer-fold-wins rule as a commit. */
  applyCards: (cards: Workcard[], options?: PlanningMirrorOptions) => Promise<void>
}
