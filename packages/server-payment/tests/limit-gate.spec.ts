import { describe, expect, test } from 'bun:test'
import type { AbstractRequest, AbstractResponse, GateService } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import {
  formatLimitParam, LIMIT_GATE, LimitExhausted, LimitWindow, windowBoundsOf,
} from '@owlmeans/payment'
import { entitlements, gateway } from '../src/utils.js'
import { makeFakeContext, PRO } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const request = (auth: Partial<Auth> | null = {}): AbstractRequest => ({
  alias: 'test', headers: {}, params: {}, query: {}, body: {}, path: '/',
  ...(auth != null ? {
    auth: {
      type: 'ed25519-basic-token', token: 't', userId: 'u', role: AuthRole.User,
      scopes: ['*'], entitySlug: 'entity-1', isUser: true, createdAt: new Date(), ...auth,
    } satisfies Auth,
  } : {}),
}) as unknown as AbstractRequest

const res = {} as AbstractResponse<unknown>
const gateOf = (fake: FakeContext): GateService => fake.ctx.service<GateService>(LIMIT_GATE)

describe('@owlmeans/server-payment — the limit gate', () => {
  test('passes with room and consumes nothing', async () => {
    const fake = await makeFakeContext()
    await gateOf(fake).assert(request(), res, [formatLimitParam('exports')])
    await gateOf(fake).assert(request(), res, [formatLimitParam('exports')])

    expect(fake.stores['payment-usage'].rows).toHaveLength(0)
    expect(fake.stores['payment-usage-counter'].rows).toHaveLength(0)
  })

  test('refuses at the ceiling with the limit, the usage and the reset date', async () => {
    const fake = await makeFakeContext()
    await entitlements(fake.ctx).consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:1' })

    const refusal = await gateOf(fake).assert(request(), res, [formatLimitParam('exports')]).catch(error => error)
    expect(refusal).toBeInstanceOf(LimitExhausted)
    expect(refusal).toBeInstanceOf(AuthForbidden)
    expect(refusal).toEqual(expect.objectContaining({
      limitKey: 'exports', used: 1, limit: 1, resetsAt: windowBoundsOf(LimitWindow.Month).resetsAt,
    }))
    await expect(gateOf(fake).assert(request(), res, [formatLimitParam('reports', 2)])).rejects.toBeInstanceOf(LimitExhausted)
  })

  test('skips malformed and undeclared parameters, ORs the rest, and refuses when none is left', async () => {
    const fake = await makeFakeContext()
    await gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', PRO, { force: true })
    await gateOf(fake).assert(request(), res, ['feature:exports', 'limit:', formatLimitParam('nope'), formatLimitParam('seats')])

    const seats = await gateOf(fake).assert(request(), res, [formatLimitParam('seats', 3), formatLimitParam('exports')])
    expect(seats).toBeUndefined()

    const malformed = await gateOf(fake).assert(request(), res, ['garbage', 'feature:x']).catch(error => error)
    expect(malformed).toBeInstanceOf(LimitExhausted)
    expect(malformed.limitKey).toBe('garbage')
  })

  test('refuses when authentication is missing or the store cannot be read', async () => {
    const fake = await makeFakeContext()
    await expect(gateOf(fake).assert(request(null), res, [formatLimitParam('exports')])).rejects.toBeInstanceOf(AuthForbidden)

    fake.stores['payment-usage-counter'].failing.add('load')
    await expect(gateOf(fake).assert(request(), res, [formatLimitParam('exports')])).rejects.toBeInstanceOf(LimitExhausted)
  })
})
