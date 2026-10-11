import type { FifoAllocation, FifoLot, FifoLotUsage, FifoSpend } from '../types.js'

/** First-in-first-out allocation of spends over granted lots. */
export interface FifoHelper {
  /**
   * First in, first out: every spend, in time order, takes from the oldest lot granted AT OR BEFORE
   * it that still has units, then the next one; what no such lot covers is `unallocated` (a lot
   * granted later never pays for an earlier spend). Lots come back in grant order. Pure — the input
   * arrays are not reordered.
   */
  allocateFifo: (lots: FifoLot[], spends: FifoSpend[]) => FifoAllocation
  /**
   * The units of a lot used strictly AFTER an instant — its consent. Without one (`null`), nothing
   * is deductible: before consent the consumer bears no cost.
   */
  unitsUsedAfter: (lot: Pick<FifoLotUsage, 'slices'>, after: Date | null | undefined) => number
}
