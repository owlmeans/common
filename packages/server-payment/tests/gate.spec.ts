import { describe, expect, test } from 'bun:test'
import type { AbstractRequest, AbstractResponse, GateService } from '@owlmeans/entrypoint'
import type { Auth, PermissionSet } from '@owlmeans/auth'
import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { CapabilityRequired, ENTITLEMENT_GATE, SubscriptionStatus } from '@owlmeans/payment'
import { entitlementsOf, makeCapabilityGate } from '../src/gate.js'
import { gateway } from '../src/utils.js'
import { CAP_BASIC, CAP_PREVIEW, CAP_WHITELABEL, makeFakeContext, past, PRO } from './fake-stripe.js'
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

const withPro = async (status: SubscriptionStatus = SubscriptionStatus.Active): Promise<FakeContext> => {
  const fake = await makeFakeContext()
  await gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', PRO, { force: true })
  fake.stores['payment-subscription'].rows[0].status = status
  return fake
}

const gateOf = (fake: FakeContext, alias: string = ENTITLEMENT_GATE): GateService => fake.ctx.service<GateService>(alias)

describe('@owlmeans/server-payment — the capability gate', () => {
  test('passes a capability of an active, trial or past-due plan; parameters are any-of', async () => {
    for (const status of [SubscriptionStatus.Active, SubscriptionStatus.Trial, SubscriptionStatus.PastDue]) {
      const fake = await withPro(status)
      await gateOf(fake).assert(request(), res, [CAP_WHITELABEL])
      await gateOf(fake).assert(request(), res, ['feature:nothing--here', CAP_WHITELABEL])
    }
  })

  test('refuses a canceled plan, an unrelated capability and a lapsed promo with CapabilityRequired (a 403)', async () => {
    const canceled = await withPro(SubscriptionStatus.Canceled)
    const refusal = await gateOf(canceled).assert(request(), res, [CAP_WHITELABEL]).catch(error => error)
    expect(refusal).toBeInstanceOf(CapabilityRequired)
    expect(refusal).toBeInstanceOf(AuthForbidden)
    expect(refusal.params).toEqual([CAP_WHITELABEL])
    await gateOf(canceled).assert(request(), res, [CAP_BASIC])

    const unrelated = await withPro()
    await expect(gateOf(unrelated).assert(request(), res, ['feature:domain--custom'])).rejects.toBeInstanceOf(CapabilityRequired)

    const lapsed = await makeFakeContext({ catalogue: { previewUntil: past(1) } })
    await expect(gateOf(lapsed).assert(request(), res, [CAP_PREVIEW])).rejects.toBeInstanceOf(CapabilityRequired)
    expect((await entitlementsOf(lapsed.ctx, 'entity-1')).some(set => set.permissions.preview != null)).toBe(false)
  })

  test('refuses a missing authentication or organization before reading storage, and an unreadable store', async () => {
    const fake = await withPro()
    fake.stores['payment-subscription'].failing.add('list')
    const noAuth = await gateOf(fake).assert(request(null), res, [CAP_WHITELABEL]).catch(error => error)
    expect(noAuth).toBeInstanceOf(AuthForbidden)
    expect(noAuth).not.toBeInstanceOf(CapabilityRequired)
    const noEntity = await gateOf(fake).assert(request({ entitySlug: undefined }), res, [CAP_WHITELABEL]).catch(error => error)
    expect(noEntity).not.toBeInstanceOf(CapabilityRequired)
    expect(noEntity).toBeInstanceOf(AuthForbidden)

    await expect(gateOf(fake).assert(request(), res, [CAP_WHITELABEL])).rejects.toBeInstanceOf(CapabilityRequired)
  })

  test('the plan is the authority: a token false denies, a token grant alone never allows, requirePermission is opt-in', async () => {
    const deny: PermissionSet[] = [{ scope: 'feature', permissions: { whitelabel: false } }]
    const grant: PermissionSet[] = [{ scope: 'feature', permissions: { whitelabel: true } }]

    const fake = await withPro()
    await expect(gateOf(fake).assert(request({ permissions: deny }), res, [CAP_WHITELABEL]))
      .rejects.toBeInstanceOf(CapabilityRequired)

    const free = await makeFakeContext()
    await expect(gateOf(free).assert(request({ permissions: grant }), res, [CAP_WHITELABEL]))
      .rejects.toBeInstanceOf(CapabilityRequired)

    fake.ctx.registerService(makeCapabilityGate('strict-gate', { requirePermission: true }))
    await expect(gateOf(fake, 'strict-gate').assert(request(), res, [CAP_WHITELABEL]))
      .rejects.toBeInstanceOf(CapabilityRequired)
    await gateOf(fake, 'strict-gate').assert(request({ permissions: grant }), res, [CAP_WHITELABEL])
  })
})
