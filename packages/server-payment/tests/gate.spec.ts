import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, GateService } from '@owlmeans/entrypoint'
import type { Auth } from '@owlmeans/auth'
import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { CAPABILITY_FEATURE_SCOPE, ENTITLEMENT_GATE } from '@owlmeans/payment'
import { SubscriptionStatus } from '@owlmeans/payment'
import { filterRecords } from '@owlmeans/resource'
import type { Criteria, ResourceRecord } from '@owlmeans/resource'
import { RES_PAYMENT_SUBSCRIPTION } from '../src/consts.js'
import { makeEntitlementGate } from '../src/gate.js'

const record = (status: SubscriptionStatus, capabilities?: unknown[]) => ({
  entityId: 'entity-1',
  productSku: 'pro',
  status,
  capabilities: capabilities ?? [
    { scope: 'renewable', permissions: { production: 1 } },
    { scope: CAPABILITY_FEATURE_SCOPE, permissions: { 'branding--whitelabel': true } },
  ],
})

/** The gate must fail closed, including when its subscription store is unreadable. */
const makeGate = async (answer: () => unknown): Promise<GateService> => {
  const ctx = makeBasicContext<BasicConfig>({
    ready: false,
    service: 'server-payment-tests',
    type: AppType.Backend,
  })
  const resource = {
    alias: RES_PAYMENT_SUBSCRIPTION,
    list: async (where?: Criteria<ResourceRecord>) => {
      const items = filterRecords(answer() as ResourceRecord[], where)
      return { items, total: items.length }
    },
    registerContext: () => resource,
    init: async () => undefined,
    ready: async () => true,
  }
  ctx.registerResource(resource as never)
  ctx.registerService(makeEntitlementGate())
  ctx.configure()
  await ctx.init()

  return ctx.service<GateService>(ENTITLEMENT_GATE)
}

const request = (auth: Partial<Auth> | null = {}): AbstractRequest => ({
  alias: 'test', headers: {}, params: {}, query: {}, body: {}, path: '/',
  ...(auth != null ? {
    auth: {
      type: 'ed25519-basic-token', token: 't', userId: 'u', role: AuthRole.User,
      scopes: [], entitySlug: 'entity-1', isUser: true, createdAt: new Date(), ...auth,
    } satisfies Auth,
  } : {}),
}) as unknown as AbstractRequest

const res = {} as AbstractResponse<unknown>

describe('@owlmeans/server-payment — the entitlement gate', () => {
  test('passes capabilities from active and trial subscriptions', async () => {
    for (const status of [SubscriptionStatus.Active, SubscriptionStatus.Trial]) {
      const gate = await makeGate(() => [record(status)])
      await gate.assert(request(), res, ['feature:branding--whitelabel'])
    }
  })

  test('refuses cancelled, missing, and unrelated capabilities', async () => {
    const canceled = await makeGate(() => [record(SubscriptionStatus.Canceled)])
    await expect(canceled.assert(request(), res, ['feature:branding--whitelabel']))
      .rejects.toBeInstanceOf(AuthForbidden)
    const unrelated = await makeGate(() => [record(SubscriptionStatus.Active)])
    await expect(unrelated.assert(request(), res, ['feature:domain--custom']))
      .rejects.toBeInstanceOf(AuthForbidden)
  })

  test('treats gate parameters as any-of', async () => {
    const gate = await makeGate(() => [record(SubscriptionStatus.Active)])
    await gate.assert(request(), res, ['feature:nothing--here', 'feature:branding--whitelabel'])
  })

  test('refuses missing authentication or organization before reading storage', async () => {
    const unread = await makeGate(() => { throw new Error('must not be reached') })
    await expect(unread.assert(request(null), res, ['feature:branding--whitelabel']))
      .rejects.toBeInstanceOf(AuthForbidden)
    const noEntity = await makeGate(() => [])
    await expect(noEntity.assert(request({ entitySlug: undefined }), res, ['feature:branding--whitelabel']))
      .rejects.toBeInstanceOf(AuthForbidden)
  })

  test('refuses when the subscription store is unreadable', async () => {
    const gate = await makeGate(() => { throw new Error('mongo is down') })
    await expect(gate.assert(request(), res, ['feature:branding--whitelabel']))
      .rejects.toBeInstanceOf(AuthForbidden)
  })
})
