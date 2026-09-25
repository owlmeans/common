/** Units granted at one instant — a purchase's credits. */
export interface FifoLot {
  id: string
  units: number
  at: Date
}

/** Units spent at one instant. */
export interface FifoSpend {
  units: number
  at: Date
}

/** One lot after allocation, with every slice of it a spend took. */
export interface FifoLotUsage {
  id: string
  at: Date
  granted: number
  used: number
  slices: Array<{ at: Date, units: number }>
}

export interface FifoAllocation {
  lots: FifoLotUsage[]
  /** Spent units no lot granted at or before the spend could cover. */
  unallocated: number
}

/**
 * First in, first out: every spend, in time order, takes from the oldest lot granted AT OR BEFORE
 * it that still has units, then the next one; what no such lot covers is `unallocated` (a lot
 * granted later never pays for an earlier spend). Lots come back in grant order. Pure — the input
 * arrays are not reordered.
 */
export const allocateFifo = (lots: FifoLot[], spends: FifoSpend[]): FifoAllocation => {
  const usage: FifoLotUsage[] = [...lots]
    .map((lot, index) => ({ lot, index }))
    .sort((a, b) => a.lot.at.getTime() - b.lot.at.getTime() || a.index - b.index)
    .map(({ lot }) => ({ id: lot.id, at: lot.at, granted: Math.max(0, lot.units), used: 0, slices: [] }))
  const ordered = [...spends]
    .map((spend, index) => ({ spend, index }))
    .sort((a, b) => a.spend.at.getTime() - b.spend.at.getTime() || a.index - b.index)

  let unallocated = 0
  for (const { spend } of ordered) {
    let left = Math.max(0, spend.units)
    for (const lot of usage) {
      if (left <= 0 || lot.at.getTime() > spend.at.getTime()) {
        break
      }
      const take = Math.min(left, lot.granted - lot.used)
      if (take > 0) {
        lot.used += take
        lot.slices.push({ at: spend.at, units: take })
        left -= take
      }
    }
    unallocated += left
  }

  return { lots: usage, unallocated }
}

/**
 * The units of a lot used strictly AFTER an instant — its consent. Without one (`null`), nothing
 * is deductible: before consent the consumer bears no cost.
 */
export const unitsUsedAfter = (lot: Pick<FifoLotUsage, 'slices'>, after: Date | null | undefined): number =>
  after == null ? 0 : lot.slices
    .filter(slice => slice.at.getTime() > after.getTime())
    .reduce((sum, slice) => sum + slice.units, 0)
