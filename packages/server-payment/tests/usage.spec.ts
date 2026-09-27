import { describe, expect, test } from 'bun:test'
import {
  LimitExhausted, LimitKind, LimitMisdeclared, LimitUnknown, LimitWindow, windowBoundsOf, windowKeyOf,
} from '@owlmeans/payment'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import { entitlements, gateway } from '../src/utils.js'
import { makeFakeContext, past, PRO } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const ledger = (fake: FakeContext) => fake.stores['payment-usage'].rows
const counters = (fake: FakeContext) => fake.stores['payment-usage-counter'].rows

const pro = async (fake: FakeContext, entityId = 'entity-1'): Promise<void> => {
  await gateway(fake.ctx).grantInternalPlan(fake.ctx, entityId, PRO, { force: true })
}

describe('@owlmeans/server-payment — consume', () => {
  test('admits up to the ceiling, then refuses without writing an event', async () => {
    const fake = await makeFakeContext()
    const service = entitlements(fake.ctx)
    const first = await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:a', ref: 'a' })
    expect(first).toEqual(expect.objectContaining({
      admitted: true, replayed: false, used: 1, limit: 1, remaining: 0,
      window: windowKeyOf(LimitKind.Window, LimitWindow.Month),
    }))

    const refusal = await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:b' })
      .catch(error => error)
    expect(refusal).toBeInstanceOf(LimitExhausted)
    expect(refusal).toEqual(expect.objectContaining({
      limitKey: 'exports', used: 1, limit: 1, resetsAt: windowBoundsOf(LimitWindow.Month).resetsAt,
    }))
    expect(ledger(fake)).toHaveLength(1)
    expect(counters(fake)[0].used).toBe(1)
  })

  test('replays an event key — at the ceiling too — without counting it twice', async () => {
    const fake = await makeFakeContext()
    const service = entitlements(fake.ctx)
    await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:a' })
    const replay = await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:a' })

    expect(replay).toEqual(expect.objectContaining({ admitted: true, replayed: true, used: 1 }))
    expect(ledger(fake)).toHaveLength(1)
    expect(counters(fake)[0].used).toBe(1)
    expect(await service.consumption('entity-1', 'exports', 'export:a')).toEqual(expect.objectContaining({ delta: 1 }))
    expect(await service.consumption('entity-1', 'exports', 'export:unknown')).toBeNull()
  })

  test('a lapsed promo refuses; a grandfathered subscription keeps the allowance', async () => {
    const fake = await makeFakeContext({ catalogue: { reportsUntil: past(1) } })
    await pro(fake, 'late')
    await expect(entitlements(fake.ctx).consume({ entityId: 'late', limitKey: 'reports', eventKey: 'r:1' }))
      .rejects.toBeInstanceOf(LimitExhausted)

    await pro(fake, 'early')
    const row = fake.stores['payment-subscription'].rows.find(item => item.entityId === 'early')!
    row.createdAt = past(5)
    expect((await entitlements(fake.ctx).consume({ entityId: 'early', limitKey: 'reports', eventKey: 'r:1' })).limit).toBe(4)
  })

  test('an undeclared key is LimitUnknown; a non-positive amount is refused', async () => {
    const fake = await makeFakeContext()
    await expect(entitlements(fake.ctx).consume({ entityId: 'entity-1', limitKey: 'nope', eventKey: 'n:1' }))
      .rejects.toBeInstanceOf(LimitUnknown)
    await expect(entitlements(fake.ctx).consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'n:1', amount: 0 }))
      .rejects.toBeInstanceOf(UnsupportedArgumentError)
  })
})

describe('@owlmeans/server-payment — release', () => {
  test('frees the unit once; a second release replays; the consumption is gone', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = entitlements(fake.ctx)
    await service.consume({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:1', ref: '1' })

    expect(await service.release({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:1' }))
      .toEqual(expect.objectContaining({ admitted: true, replayed: false, used: 0 }))
    expect(await service.release({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:1' }))
      .toEqual(expect.objectContaining({ admitted: true, replayed: true, used: 0 }))
    expect(ledger(fake).map(event => event.delta)).toEqual([1, -1])
    expect(await service.consumption('entity-1', 'reports', 'report:1')).toBeNull()
    expect(await service.release({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:never' }))
      .toEqual(expect.objectContaining({ admitted: false, replayed: false }))
  })

  test('consumptionByRef finds the unit a record holds under a fresh key per cycle', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = entitlements(fake.ctx)
    expect(await service.consumptionByRef('entity-1', 'seats', 'record-1')).toBeNull()

    await service.consume({ entityId: 'entity-1', limitKey: 'seats', eventKey: 'seats:record-1:1', ref: 'record-1' })
    expect(await service.consumptionByRef('entity-1', 'seats', 'record-1'))
      .toEqual(expect.objectContaining({ eventKey: 'seats:record-1:1', delta: 1 }))

    await Bun.sleep(3)
    await service.consume({ entityId: 'entity-1', limitKey: 'seats', eventKey: 'seats:record-1:2', ref: 'record-1' })
    expect((await service.consumptionByRef('entity-1', 'seats', 'record-1'))?.eventKey).toBe('seats:record-1:2')
    expect(await service.consumptionByRef('entity-1', 'seats', 'record-2')).toBeNull()

    await service.release({ entityId: 'entity-1', limitKey: 'seats', eventKey: 'seats:record-1:2' })
    expect((await service.consumptionByRef('entity-1', 'seats', 'record-1'))?.eventKey).toBe('seats:record-1:1')
    await service.release({ entityId: 'entity-1', limitKey: 'seats', eventKey: 'seats:record-1:1' })
    expect(await service.consumptionByRef('entity-1', 'seats', 'record-1')).toBeNull()
  })

  test('never takes a counter below zero', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = entitlements(fake.ctx)
    await service.consume({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:1' })
    counters(fake)[0].used = 0

    expect((await service.release({ entityId: 'entity-1', limitKey: 'reports', eventKey: 'report:1' })).used).toBe(0)
    expect(counters(fake)[0].used).toBe(0)
  })
})

describe('@owlmeans/server-payment — reconciliation', () => {
  test('reconcileCounters repairs drift from the ledger, drops empty past windows and creates the current one', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = entitlements(fake.ctx)
    await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:1' })
    await service.consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:2' })
    counters(fake)[0].used = 3
    counters(fake).push({ entityId: 'entity-1', limitKey: 'exports', window: '2001-01-01', used: 2, limit: 3, updatedAt: past(9000) })
    counters(fake).push({ entityId: 'entity-1', limitKey: 'reports', window: 'lifetime', used: 2, limit: 4, updatedAt: past(1) })

    const result = await service.reconcileCounters('entity-1')
    expect(result.repaired).toBe(2)
    const today = windowKeyOf(LimitKind.Window, LimitWindow.Day)
    expect(counters(fake).find(counter => counter.window === today)?.used).toBe(2)
    expect(counters(fake).some(counter => counter.window === '2001-01-01')).toBe(false)
    expect(counters(fake).find(counter => counter.window === 'lifetime')?.used).toBe(0)

    const fresh = await makeFakeContext()
    await entitlements(fresh.ctx).reconcileCounters('entity-9')
    expect(counters(fresh)).toEqual([expect.objectContaining({
      entityId: 'entity-9', limitKey: 'exports', window: windowKeyOf(LimitKind.Window, LimitWindow.Month), used: 0,
    })])
  })

  test('reconcileOccupancy writes one adjusting event a day and flags an entity over its limit', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = entitlements(fake.ctx)
    await service.consume({ entityId: 'entity-1', limitKey: 'seats', eventKey: 'seat:1' })

    const over = await service.reconcileOccupancy('entity-1', 'seats', 3)
    expect(over).toEqual(expect.objectContaining({ used: 3, limit: 2, over: 1 }))
    expect(over.overSince).toBeInstanceOf(Date)
    const again = await service.reconcileOccupancy('entity-1', 'seats', 3)
    expect(again.overSince?.getTime()).toBe(over.overSince?.getTime())

    const within = await service.reconcileOccupancy('entity-1', 'seats', 1)
    expect(within).toEqual({ limitKey: 'seats', used: 1, limit: 2, over: 0 })
    const adjustments = ledger(fake).filter(event => event.eventKey.startsWith('reconcile:seats:'))
    expect(adjustments).toHaveLength(1)
    expect(ledger(fake).reduce((sum, event) => sum + event.delta, 0)).toBe(1)
    expect(counters(fake).find(counter => counter.limitKey === 'seats')?.overSince).toBeUndefined()
  })

  test('reconcileOccupancy refuses a limit that is not an occupancy', async () => {
    const fake = await makeFakeContext()
    await expect(entitlements(fake.ctx).reconcileOccupancy('entity-1', 'exports', 1))
      .rejects.toBeInstanceOf(LimitMisdeclared)
  })
})
