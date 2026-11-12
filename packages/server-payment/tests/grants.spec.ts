import { describe, expect, test } from 'bun:test'
import type { AbstractRequest, AbstractResponse, GateService } from '@owlmeans/entrypoint'
import { AuthRole, type Auth } from '@owlmeans/auth'
import {
  ENTITLEMENT_GATE, LIMIT_GATE, LimitExhausted, LimitKind, LimitUnknown, LimitWindow, planLimitHelper,
} from '@owlmeans/payment'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import { EntitlementGrantKind, EntitlementGrantStatus } from '../src/consts.js'
import type { EntitlementGrantSpec, PaymentGrantRecord } from '../src/types.js'
import { CAP_PREVIEW, CAP_WHITELABEL, future, makeFakeContext, past, PRO } from '@owlmeans/test-payment'
import type { FakeContext } from '@owlmeans/test-payment'
import { paymentAccessOf } from '../src/access.js'
import { catalogueOf } from '../src/catalogue.js'

const ENTITY = 'entity-1'

const grants = (fake: FakeContext) => fake.stores['payment-grant'].rows
const ledger = (fake: FakeContext) => fake.stores['payment-usage'].rows
const counters = (fake: FakeContext) => fake.stores['payment-usage-counter'].rows

const units = (limitKey: string, amount: number, extra: Partial<EntitlementGrantSpec> = {}): EntitlementGrantSpec =>
  ({ kind: EntitlementGrantKind.Units, limitKey, amount, ...extra })

const give = async (fake: FakeContext, spec: EntitlementGrantSpec, entityId = ENTITY): Promise<PaymentGrantRecord> =>
  await paymentAccessOf(fake.ctx).grants().grant(entityId, spec)

const usedOf = (fake: FakeContext, grantId: string): number | undefined =>
  grants(fake).find(row => row.id === grantId)?.used

const pro = async (fake: FakeContext, entityId = ENTITY): Promise<void> => {
  await paymentAccessOf(fake.ctx).gateway().grantInternalPlan(fake.ctx, entityId, PRO, { force: true })
}

const request = (): AbstractRequest => ({
  alias: 'test', headers: {}, params: {}, query: {}, body: {}, path: '/',
  auth: {
    type: 'ed25519-basic-token', token: 't', userId: 'u', role: AuthRole.User, scopes: ['*'], entitySlug: ENTITY,
    isUser: true, createdAt: new Date(),
  } satisfies Auth,
}) as unknown as AbstractRequest

describe('@owlmeans/server-payment — units grants', () => {
  test('are consumed only after the plan, the earliest end first, and fold into every number', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    // The free plan: one export a month.
    const open = await give(fake, units('exports', 2))
    const ending = await give(fake, units('exports', 1, { endsAt: future(5) }))
    const month = planLimitHelper.windowKeyOf(LimitKind.Window, LimitWindow.Month)

    const first = await service.consume({ entityId: ENTITY, limitKey: 'exports', eventKey: 'export:1' })
    expect(first).toEqual(expect.objectContaining({ admitted: true, window: month, used: 1, limit: 4, remaining: 3 }))
    expect(usedOf(fake, ending.id!)).toBe(0)

    const second = await service.consume({ entityId: ENTITY, limitKey: 'exports', eventKey: 'export:2' })
    expect(second).toEqual(expect.objectContaining({ admitted: true, window: `grant:${ending.id}`, used: 2, remaining: 2 }))
    expect((await service.consume({ entityId: ENTITY, limitKey: 'exports', eventKey: 'export:3' })).window).toBe(`grant:${open.id}`)
    expect((await service.consume({ entityId: ENTITY, limitKey: 'exports', eventKey: 'export:4' })).remaining).toBe(0)

    const refusal = await service.consume({ entityId: ENTITY, limitKey: 'exports', eventKey: 'export:5' }).catch(error => error)
    expect(refusal).toBeInstanceOf(LimitExhausted)
    expect(refusal).toEqual(expect.objectContaining({ used: 4, limit: 4 }))

    expect([usedOf(fake, ending.id!), usedOf(fake, open.id!)]).toEqual([1, 2])
    expect(await service.limitState(ENTITY, 'exports')).toEqual(expect.objectContaining({ limit: 4, used: 4, remaining: 0 }))
    expect((await service.entitlements(ENTITY)).limits.find(row => row.key === 'exports'))
      .toEqual(expect.objectContaining({ limit: 4, used: 4, remaining: 0 }))
    // The grants' events never make a counter: the plan's month counter is the only one.
    expect(ledger(fake)).toHaveLength(4)
    expect(counters(fake).map(counter => [counter.window, counter.used])).toEqual([[month, 1]])
    // Another limit of the same entity reads as it always did.
    expect(await service.limitState(ENTITY, 'reports')).toEqual(expect.objectContaining({ limit: 1, used: 0, remaining: 1 }))
  })

  test('a release gives the unit back to its grant; replays and a released key behave as on the plan', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    const extra = await give(fake, units('reports', 2))
    await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:plan' })
    const held = await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:a', ref: 'a' })
    expect(held.window).toBe(`grant:${extra.id}`)

    const replay = await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:a' })
    expect(replay).toEqual(expect.objectContaining({ admitted: true, replayed: true, window: `grant:${extra.id}`, used: 2, limit: 3 }))
    expect(usedOf(fake, extra.id!)).toBe(1)
    expect((await service.consumptionByRef(ENTITY, 'reports', 'a'))?.eventKey).toBe('report:a')

    const released = await service.release({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:a' })
    expect(released).toEqual(expect.objectContaining({ admitted: true, replayed: false, used: 1, limit: 3, remaining: 2 }))
    expect(usedOf(fake, extra.id!)).toBe(0)
    expect((await service.release({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:a' })).replayed).toBe(true)
    expect(usedOf(fake, extra.id!)).toBe(0)
    // The plan's counter was never touched by the grant's unit.
    expect(counters(fake).find(counter => counter.limitKey === 'reports')?.used).toBe(1)
    expect((await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:a' })).admitted).toBe(false)
  })

  test('an occupancy grant raises the ceiling; reconciliation splits the live count and flags a revoked grant\'s site', async () => {
    const fake = await makeFakeContext()
    await pro(fake)
    const service = paymentAccessOf(fake.ctx).entitlements()
    const seat = await give(fake, units('seats', 1))
    for (const site of ['s1', 's2', 's3']) {
      await service.consume({ entityId: ENTITY, limitKey: 'seats', eventKey: `seats:${site}`, ref: site })
    }
    expect(usedOf(fake, seat.id!)).toBe(1)
    await expect(service.consume({ entityId: ENTITY, limitKey: 'seats', eventKey: 'seats:s4' })).rejects.toBeInstanceOf(LimitExhausted)
    expect(await service.reconcileOccupancy(ENTITY, 'seats', 3)).toEqual({ limitKey: 'seats', used: 3, limit: 3, over: 0 })
    expect(counters(fake).find(counter => counter.limitKey === 'seats')?.used).toBe(2)

    // Revoked: the held site stays held, the ceiling drops — the live count goes over and is flagged.
    await paymentAccessOf(fake.ctx).grants().revoke(seat.id!)
    expect(await service.limitState(ENTITY, 'seats')).toEqual(expect.objectContaining({ limit: 2, used: 2, remaining: 0 }))
    const over = await service.reconcileOccupancy(ENTITY, 'seats', 3)
    expect(over).toEqual(expect.objectContaining({ used: 3, limit: 2, over: 1 }))
    expect(over.overSince).toBeInstanceOf(Date)

    // A new grant covers the site over the plan first: no room is left for a fourth.
    await give(fake, units('seats', 1))
    expect(await service.limitState(ENTITY, 'seats')).toEqual(expect.objectContaining({ limit: 3, used: 3, remaining: 0 }))
    await expect(service.consume({ entityId: ENTITY, limitKey: 'seats', eventKey: 'seats:s5' })).rejects.toBeInstanceOf(LimitExhausted)
    expect(await service.reconcileOccupancy(ENTITY, 'seats', 3)).toEqual({ limitKey: 'seats', used: 3, limit: 3, over: 0 })

    // The revoked grant's site stops: its unit goes back to that grant, the plan counter follows reality.
    await service.release({ entityId: ENTITY, limitKey: 'seats', eventKey: 'seats:s3' })
    expect(usedOf(fake, seat.id!)).toBe(0)
    expect(await service.reconcileOccupancy(ENTITY, 'seats', 2)).toEqual({ limitKey: 'seats', used: 2, limit: 3, over: 0 })
  })

  test('the limit gate reads the folded room', async () => {
    const fake = await makeFakeContext()
    const gate = fake.ctx.service<GateService>(LIMIT_GATE)
    const res = {} as AbstractResponse<unknown>
    // The free plan holds no seat at all.
    await expect(gate.assert(request(), res, [planLimitHelper.formatLimitParam('seats')])).rejects.toBeInstanceOf(LimitExhausted)

    await give(fake, units('seats', 1))
    await gate.assert(request(), res, [planLimitHelper.formatLimitParam('seats')])
    expect((await paymentAccessOf(fake.ctx).entitlements().consume({ entityId: ENTITY, limitKey: 'seats', eventKey: 'seat:1' })).admitted).toBe(true)
    await expect(gate.assert(request(), res, [planLimitHelper.formatLimitParam('seats')])).rejects.toBeInstanceOf(LimitExhausted)
  })
})

describe('@owlmeans/server-payment — grant lifecycle', () => {
  test('a revoke keeps the used units consumed and drops the unused; observers hear each change once', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    const extra = await give(fake, units('reports', 3, { ref: 'op-1', note: 'support' }))
    await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:plan' })
    await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:granted' })
    expect(await service.limitState(ENTITY, 'reports')).toEqual(expect.objectContaining({ limit: 4, used: 2 }))

    const revoked = await paymentAccessOf(fake.ctx).grants().revoke(extra.id!, { entityId: ENTITY })
    expect(revoked.changed).toBe(true)
    expect(revoked.grant).toEqual(expect.objectContaining({ status: EntitlementGrantStatus.Revoked, used: 1, ref: 'op-1' }))
    expect(revoked.grant?.revokedAt).toBeInstanceOf(Date)
    expect(await service.limitState(ENTITY, 'reports')).toEqual(expect.objectContaining({ limit: 1, used: 1, remaining: 0 }))
    expect(await service.consumption(ENTITY, 'reports', 'report:granted')).not.toBeNull()

    expect((await paymentAccessOf(fake.ctx).grants().revoke(extra.id!)).changed).toBe(false)
    expect(await paymentAccessOf(fake.ctx).grants().revoke(extra.id!, { entityId: 'entity-2' })).toEqual({ grant: null, changed: false })
    expect(await paymentAccessOf(fake.ctx).grants().revoke('unknown')).toEqual({ grant: null, changed: false })
    expect(fake.observed.grant.map(event => [event.change, event.eventKey, event.entityId])).toEqual([
      ['granted', `grant:${extra.id}:granted`, ENTITY], ['revoked', `grant:${extra.id}:revoked`, ENTITY],
    ])
  })

  test('a grant not yet started or already ended is ignored; list narrows by what is in force', async () => {
    const fake = await makeFakeContext()
    const ended = await give(fake, units('reports', 5, { startsAt: past(3), endsAt: past(1) }))
    const later = await give(fake, units('reports', 5, { startsAt: future(1) }))
    const now = await give(fake, units('reports', 2, { endsAt: future(1) }))

    expect((await paymentAccessOf(fake.ctx).entitlements().limitState(ENTITY, 'reports')).limit).toBe(3)
    const access = paymentAccessOf(fake.ctx).grants()
    expect((await access.list(ENTITY, { active: true })).map(grant => grant.id)).toEqual([now.id])
    expect((await access.list(ENTITY, { active: false })).map(grant => grant.id).sort()).toEqual([ended.id, later.id].sort())
    expect(await access.list(ENTITY)).toHaveLength(3)
    expect((await access.list(ENTITY, { active: true, at: future(2) })).map(grant => grant.id)).toEqual([later.id])
    expect((await access.get(now.id!))?.amount).toBe(2)
  })

  test('reconcileCounters rebuilds each grant\'s used from its events, never as a counter window', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    const extra = await give(fake, units('reports', 5))
    const idle = await give(fake, units('reports', 5))
    for (const key of ['plan', 'a', 'b', 'c']) {
      await service.consume({ entityId: ENTITY, limitKey: 'reports', eventKey: `report:${key}` })
    }
    await service.release({ entityId: ENTITY, limitKey: 'reports', eventKey: 'report:b' })
    grants(fake).find(row => row.id === extra.id)!.used = 7
    grants(fake).find(row => row.id === idle.id)!.used = 1

    const result = await service.reconcileCounters(ENTITY)
    expect(result.repaired).toBe(2)
    expect([usedOf(fake, extra.id!), usedOf(fake, idle.id!)]).toEqual([2, 0])
    expect(counters(fake).every(counter => !String(counter.window).startsWith('grant:'))).toBe(true)
    expect(counters(fake).find(counter => counter.limitKey === 'reports')?.used).toBe(1)
  })

  test('refuses a malformed grant before anything is stored; an observer failure never undoes one', async () => {
    const fake = await makeFakeContext()
    const access = paymentAccessOf(fake.ctx).grants()
    await expect(access.grant(ENTITY, { kind: EntitlementGrantKind.Units, amount: 1 })).rejects.toBeInstanceOf(UnsupportedArgumentError)
    await expect(access.grant(ENTITY, units('reports', 0))).rejects.toBeInstanceOf(UnsupportedArgumentError)
    await expect(access.grant(ENTITY, units('nothing', 1))).rejects.toBeInstanceOf(LimitUnknown)
    await expect(access.grant(ENTITY, { kind: EntitlementGrantKind.Capability, capability: 'limit:reports' }))
      .rejects.toBeInstanceOf(UnsupportedArgumentError)
    await expect(access.grant(ENTITY, units('reports', 1, { startsAt: future(2), endsAt: future(1) })))
      .rejects.toBeInstanceOf(UnsupportedArgumentError)
    await expect(access.grant('', units('reports', 1))).rejects.toBeInstanceOf(UnsupportedArgumentError)
    expect(grants(fake)).toHaveLength(0)

    fake.observed.failGrant = 1
    const stored = await access.grant(ENTITY, units('reports', 1))
    expect(stored).toEqual(expect.objectContaining({ kind: EntitlementGrantKind.Units, used: 0, status: EntitlementGrantStatus.Active }))
    expect(grants(fake)).toHaveLength(1)
    expect(fake.observed.grant).toHaveLength(0)
  })
})

describe('@owlmeans/server-payment — capability grants', () => {
  test('merge into the effective plan while in force, and are gone once ended or revoked', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    const gate = fake.ctx.service<GateService>(ENTITLEMENT_GATE)
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(false)

    const granted = await give(fake, { kind: EntitlementGrantKind.Capability, capability: CAP_WHITELABEL })
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(true)
    await gate.assert(request(), {} as AbstractResponse<unknown>, [CAP_WHITELABEL])
    expect((await service.effectivePlan(ENTITY)).plan.capabilities?.some(set => set.permissions.whitelabel === true)).toBe(true)
    expect((await catalogueOf(fake.ctx).entitlementsOf(ENTITY)).some(set => set.permissions.whitelabel === true)).toBe(true)
    // Only this organization holds it.
    expect(await service.hasCapability('entity-2', CAP_WHITELABEL)).toBe(false)

    grants(fake).find(row => row.id === granted.id)!.endsAt = past(1)
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(false)
    grants(fake).find(row => row.id === granted.id)!.endsAt = future(1)
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(true)
    await paymentAccessOf(fake.ctx).grants().revoke(granted.id!)
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(false)
  })

  test('a units grant carries the capability its units need, and loses it with them', async () => {
    const fake = await makeFakeContext()
    const service = paymentAccessOf(fake.ctx).entitlements()
    // The free plan holds no seat and no white-labeling.
    const seats = await give(fake, units('seats', 1, { capability: CAP_WHITELABEL }))
    expect(seats).toEqual(expect.objectContaining({ kind: EntitlementGrantKind.Units, capability: CAP_WHITELABEL }))
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(true)
    expect(await service.limitState(ENTITY, 'seats')).toEqual(expect.objectContaining({ limit: 1, remaining: 1 }))

    await paymentAccessOf(fake.ctx).grants().revoke(seats.id!)
    expect(await service.hasCapability(ENTITY, CAP_WHITELABEL)).toBe(false)
    expect((await service.limitState(ENTITY, 'seats')).limit).toBe(0)
    await expect(give(fake, units('seats', 1, { capability: 'limit:seats' }))).rejects.toBeInstanceOf(UnsupportedArgumentError)
  })

  test('replace a lapsed promo\'s row with one granted row; a plan granting it already is left alone', async () => {
    const fake = await makeFakeContext({ catalogue: { previewUntil: past(1) } })
    const service = paymentAccessOf(fake.ctx).entitlements()
    expect(await service.hasCapability(ENTITY, CAP_PREVIEW)).toBe(false)

    await give(fake, { kind: EntitlementGrantKind.Capability, capability: CAP_PREVIEW })
    const rows = (await service.entitlements(ENTITY)).capabilities.filter(row => row.param === CAP_PREVIEW)
    expect(rows).toEqual([expect.objectContaining({ granted: true })])
    expect(rows[0].promo).toBeUndefined()

    await pro(fake, 'entity-2')
    await give(fake, { kind: EntitlementGrantKind.Capability, capability: CAP_WHITELABEL }, 'entity-2')
    const plan = (await service.effectivePlan('entity-2')).plan
    expect(plan.capabilities?.filter(set => set.permissions.whitelabel != null)).toHaveLength(1)
  })
})
