import { describe, expect, test } from 'bun:test'
import { allocateFifo, unitsUsedAfter } from '../src/index.js'

const t = (hour: number): Date => new Date(Date.UTC(2026, 8, 23, hour))

describe('allocateFifo', () => {
  test('a spend takes the oldest lot first and spills into the next', () => {
    const { lots, unallocated } = allocateFifo(
      [{ id: 'b', units: 100, at: t(3) }, { id: 'a', units: 100, at: t(1) }],
      [{ units: 80, at: t(4) }, { units: 50, at: t(2) }],
    )
    expect(lots.map(lot => lot.id)).toEqual(['a', 'b'])
    expect(lots[0]).toMatchObject({ granted: 100, used: 100, slices: [{ at: t(2), units: 50 }, { at: t(4), units: 50 }] })
    expect(lots[1]).toMatchObject({ granted: 100, used: 30, slices: [{ at: t(4), units: 30 }] })
    expect(unallocated).toBe(0)
  })

  test('a lot granted after a spend never pays for it', () => {
    const { lots, unallocated } = allocateFifo([{ id: 'late', units: 100, at: t(5) }], [{ units: 40, at: t(4) }])
    expect(lots[0].used).toBe(0)
    expect(unallocated).toBe(40)
  })

  test('a spend at the grant instant takes from the lot', () => {
    expect(allocateFifo([{ id: 'a', units: 10, at: t(1) }], [{ units: 4, at: t(1) }]).lots[0].used).toBe(4)
  })

  test('overflow beyond every lot is unallocated', () => {
    const { lots, unallocated } = allocateFifo(
      [{ id: 'a', units: 100, at: t(1) }, { id: 'b', units: 100, at: t(2) }],
      [{ units: 250, at: t(3) }],
    )
    expect(lots.map(lot => lot.used)).toEqual([100, 100])
    expect(unallocated).toBe(50)
  })

  test('leaves its inputs untouched', () => {
    const lots = [{ id: 'b', units: 1, at: t(2) }, { id: 'a', units: 1, at: t(1) }]
    const spends = [{ units: 1, at: t(3) }]
    allocateFifo(lots, spends)
    expect(lots.map(lot => lot.id)).toEqual(['b', 'a'])
  })
})

describe('unitsUsedAfter', () => {
  const { lots } = allocateFifo(
    [{ id: 'a', units: 100, at: t(1) }],
    [{ units: 10, at: t(2) }, { units: 20, at: t(3) }, { units: 30, at: t(4) }],
  )

  test('counts only the slices strictly after the consent', () => {
    expect(unitsUsedAfter(lots[0], t(1))).toBe(60)
    expect(unitsUsedAfter(lots[0], t(3))).toBe(30)
    expect(unitsUsedAfter(lots[0], t(4))).toBe(0)
  })

  test('without a consent nothing is deductible', () => {
    expect(unitsUsedAfter(lots[0], null)).toBe(0)
    expect(unitsUsedAfter(lots[0], undefined)).toBe(0)
  })
})
