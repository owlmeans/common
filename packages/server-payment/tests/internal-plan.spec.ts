import { describe, expect, test } from 'bun:test'
import { SubscriptionStatus } from '@owlmeans/payment'
import { FREE, future, makeFakeContext, past, PRO } from '@owlmeans/test-payment'
import type { FakeContext } from '@owlmeans/test-payment'
import { paymentAccessOf } from '../src/access.js'

const ENTITY = 'entity-1'
const ROW = `internal:${PRO}:${ENTITY}`

const rowOf = (fake: FakeContext) => fake.stores['payment-subscription'].rows.find(row => row.externalId === ROW)!
const changes = (fake: FakeContext) => fake.observed.subscription.map(event => event.change)
const gateway = (fake: FakeContext) => paymentAccessOf(fake.ctx).gateway()
const grantPro = async (fake: FakeContext, periodEnd?: Date) =>
  await gateway(fake).grantInternalPlan(fake.ctx, ENTITY, PRO, { force: true, ...(periodEnd != null ? { periodEnd } : {}) })
const planOf = async (fake: FakeContext): Promise<string> =>
  (await paymentAccessOf(fake.ctx).entitlements().effectivePlan(ENTITY)).plan.sku

describe('@owlmeans/server-payment — revoking an internal plan', () => {
  test('ends the row now and tells observers `canceled`, once', async () => {
    const fake = await makeFakeContext()
    await grantPro(fake, future(30))
    const before = Date.now()

    expect(await gateway(fake).revokeInternalPlan(fake.ctx, ENTITY, PRO)).toBe(true)
    const row = rowOf(fake)
    expect(row.status).toBe(SubscriptionStatus.Canceled)
    expect(new Date(row.periodEnd).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(row.periodEnd).getTime()).toBeLessThanOrEqual(Date.now())
    expect(row.endedAt).toEqual(row.periodEnd)
    expect(await planOf(fake)).toBe(FREE)

    const canceled = fake.observed.subscription[1]
    expect(canceled).toEqual(expect.objectContaining({ change: 'canceled', active: false }))
    expect(canceled.previous).toEqual(expect.objectContaining({ planSku: PRO, status: SubscriptionStatus.Active }))
    expect(canceled.current.status).toBe(SubscriptionStatus.Canceled)

    expect(await gateway(fake).revokeInternalPlan(fake.ctx, ENTITY, PRO)).toBe(false)
    expect(await gateway(fake).revokeInternalPlan(fake.ctx, 'entity-2', PRO)).toBe(false)
    expect(changes(fake)).toEqual(['created', 'canceled'])
  })

  test('a grant already past its period end keeps that instant as its end', async () => {
    const fake = await makeFakeContext()
    await grantPro(fake, future(1))
    const lapsed = past(2)
    rowOf(fake).periodEnd = lapsed

    expect(await gateway(fake).revokeInternalPlan(fake.ctx, ENTITY, PRO)).toBe(true)
    expect(new Date(rowOf(fake).periodEnd).getTime()).toBe(lapsed.getTime())
    expect(changes(fake)).toEqual(['created', 'canceled'])
  })
})

describe('@owlmeans/server-payment — re-granting an internal plan', () => {
  test('after a revoke: the row entitles again, observers hear `created` anew, `createdAt` is the first grant\'s', async () => {
    const fake = await makeFakeContext()
    const first = await grantPro(fake)
    await gateway(fake).revokeInternalPlan(fake.ctx, ENTITY, PRO)

    const again = await grantPro(fake, future(30))
    expect(again.status).toBe(SubscriptionStatus.Active)
    expect(again.canceledAt ?? null).toBeNull()
    expect(again.endedAt ?? null).toBeNull()
    expect(new Date(again.createdAt).getTime()).toBe(new Date(first.createdAt).getTime())
    expect(again.restartedAt).toBeInstanceOf(Date)
    expect(await planOf(fake)).toBe(PRO)

    expect(changes(fake)).toEqual(['created', 'canceled', 'created'])
    const [created, , restarted] = fake.observed.subscription
    expect(restarted.previous).toBeNull()
    expect(restarted.active).toBe(true)
    expect(restarted.eventKey)
      .toBe(`subscription:${ROW}:created:${new Date(first.createdAt).toISOString()}:${new Date(again.restartedAt!).toISOString()}`)
    expect(restarted.eventKey).not.toBe(created.eventKey)

    // A re-grant of an entitling row moves its period end and tells nobody.
    await grantPro(fake, future(60))
    expect(changes(fake)).toEqual(['created', 'canceled', 'created'])
  })

  test('after a lapse it reports the change; a restart observers missed is told again under the same key', async () => {
    const fake = await makeFakeContext()
    await grantPro(fake, future(1))
    rowOf(fake).periodEnd = past(1)
    expect(await planOf(fake)).toBe(FREE)

    fake.observed.failSubscription = 1
    await expect(grantPro(fake, future(30))).rejects.toThrow('observer unavailable')
    const restartedAt = rowOf(fake).restartedAt as Date
    expect(restartedAt).toBeInstanceOf(Date)

    await grantPro(fake, future(30))
    expect(changes(fake)).toEqual(['created', 'created'])
    expect(fake.observed.subscription[1].eventKey).toEndWith(`:${new Date(restartedAt).toISOString()}`)
    expect(new Date(rowOf(fake).restartedAt).getTime()).toBe(new Date(restartedAt).getTime())
    expect(new Date(rowOf(fake).propagated.restartedAt).getTime()).toBe(new Date(restartedAt).getTime())

    await grantPro(fake, future(30))
    expect(changes(fake)).toEqual(['created', 'created'])
  })

  test('without a revoke or a lapse nothing changes: one row, one `created`, the original key', async () => {
    const fake = await makeFakeContext()
    const first = await grantPro(fake)
    await grantPro(fake)

    expect(fake.stores['payment-subscription'].rows).toHaveLength(1)
    expect(rowOf(fake).restartedAt).toBeUndefined()
    expect(fake.observed.subscription.map(event => event.eventKey))
      .toEqual([`subscription:${ROW}:created:${new Date(first.createdAt).toISOString()}`])
  })
})
