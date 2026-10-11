import type { FifoAllocation, FifoLot, FifoLotUsage, FifoSpend } from './types.js'
import type { FifoHelper } from './fifo/types.js'

export const createFifoHelper = (): FifoHelper => {
  const allocateFifo = (lots: FifoLot[], spends: FifoSpend[]): FifoAllocation => {
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

  const unitsUsedAfter = (lot: Pick<FifoLotUsage, 'slices'>, after: Date | null | undefined): number =>
    after == null ? 0 : lot.slices
      .filter(slice => slice.at.getTime() > after.getTime())
      .reduce((sum, slice) => sum + slice.units, 0)

  return { allocateFifo, unitsUsedAfter }
}

export const fifoHelper = createFifoHelper()
