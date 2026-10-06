export type LockMode = 'wait' | 'try'

/** What one pass of the prelude found: the card's organization and how much `foldPending` may fold. */
export interface FoldPlan {
  entityId: string
  /** Consecutive pending rows at the cursor — exactly what `foldPending` folds this pass. */
  run: number
  /** The log goes on after the run in a way the next pass handles (a failed row, a gap). */
  more: boolean
  /** The read hit `foldBatch`: a next round has more to read. */
  full: boolean
}
