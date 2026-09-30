import { describe, expect, test } from 'bun:test'
import { PaygateError, PortalFlow, WebhookSetupError } from '@owlmeans/payment'
import { RES_PAYMENT_FINGERPRINT, RES_PAYMENT_WEBHOOK } from '../src/consts.js'
import { ensurePortalConfiguration } from '../src/plugins/portal.js'
import {
  ensureWebhookEndpoint, gatewayOwnerOf, stripeWebhookSecret, webhookServiceOf, webhookUrlOf,
} from '../src/plugins/webhook-manager.js'
import { bootstrapStripe, makeGatewayService } from '../src/service.js'
import { gateway, paygateCustomers } from '../src/utils.js'
import { makeFakeContext, SERVICE } from './fake-stripe.js'
import type { FakeContext, FakeContextOptions } from './fake-stripe.js'
import type { GatewayServiceOptions } from '../src/service.js'

const WEB = 'app.example.com'
const HOOKS = 'hooks.example.com'
const HOOK_SERVICE = 'hooks'
const WEB_URL = `https://${WEB}/api/payment-gate/webhook/stripe`
const HOOK_URL = `https://${HOOKS}/payment-gate/webhook/stripe`
const PORTAL = { returnUrl: `https://${WEB}/billing` }
const labelOf = (owner: string) => ({ owlmeans: 'payment', service: owner })

/** Poll until `ready` holds — a boot bootstrap runs once the context is initialized, unawaited. */
const until = async (ready: () => boolean, ms = 3000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('condition not reached')
    await Bun.sleep(5)
  }
}

/**
 * The two managed processes of one deployment sharing a database and a Stripe account: the manager
 * (`cfg.service` = SERVICE, on the web host under `/api`) and the hook receiver (its own host) — both
 * with `owner` SERVICE and `webhookService` the hook receiver.
 */
const managerProcess = async (gatewayOpts: GatewayServiceOptions = {}, extra: FakeContextOptions = {}): Promise<FakeContext> =>
  await makeFakeContext({
    service: SERVICE, host: WEB, base: 'api', services: { [HOOK_SERVICE]: { host: HOOKS } }, portal: PORTAL,
    ...extra, gateway: { owner: SERVICE, webhookService: HOOK_SERVICE, ...gatewayOpts },
  })
const hookProcess = async (gatewayOpts: GatewayServiceOptions = {}, extra: FakeContextOptions = {}): Promise<FakeContext> =>
  await makeFakeContext({
    service: HOOK_SERVICE, host: HOOKS, services: { [SERVICE]: { host: WEB, base: 'api' } }, portal: PORTAL,
    ...extra, gateway: { manage: true, owner: SERVICE, webhookService: HOOK_SERVICE, ...gatewayOpts },
  })

/** A boot bootstrap is done once the webhook step has left exactly one endpoint and one row. */
const bootstrapped = (fake: FakeContext, url: string) => (): boolean =>
  fake.state.webhookEndpoints.length === 1 && fake.state.webhookEndpoints[0].url === url
  && fake.stores[RES_PAYMENT_WEBHOOK].rows.length === 1 && fake.stores[RES_PAYMENT_WEBHOOK].rows[0].url === url

describe('@owlmeans/server-payment — gateway options: defaults', () => {
  test('without options the URL, the row key and the portal key are this service\'s own, and bootstrap follows manage', async () => {
    const reader = await makeFakeContext({ host: WEB, base: 'api' })
    expect(gateway(reader.ctx)).toEqual(expect.objectContaining({
      managed: false, bootstrap: false, owner: SERVICE, webhookService: SERVICE,
    }))
    expect(webhookUrlOf(reader.ctx)).toBe(WEB_URL)

    const owner = await makeFakeContext({ host: WEB, base: 'api', portal: PORTAL, gateway: { manage: true } })
    expect(gateway(owner.ctx).bootstrap).toBe(true)
    await until(bootstrapped(owner, WEB_URL))
    expect(owner.state.webhookEndpoints[0]).toEqual(expect.objectContaining({
      metadata: labelOf(SERVICE), description: `owlmeans:${SERVICE}`,
    }))
    expect(owner.stores[RES_PAYMENT_WEBHOOK].rows).toEqual([expect.objectContaining({ service: SERVICE, url: WEB_URL })])
    expect(owner.stores[RES_PAYMENT_FINGERPRINT].rows).toContainEqual(expect.objectContaining({ sku: `portal:${SERVICE}` }))
  })
})

describe('@owlmeans/server-payment — gateway options: webhookService and owner', () => {
  test('webhookService forms the URL on its own host; owner keys the rows, the secret, the labels and the portal', async () => {
    const hook = await hookProcess({ bootstrap: false })
    expect(webhookServiceOf(hook.ctx)).toBe(HOOK_SERVICE)
    expect(gatewayOwnerOf(hook.ctx)).toBe(SERVICE)
    expect(webhookUrlOf(hook.ctx)).toBe(HOOK_URL)

    const row = await ensureWebhookEndpoint(hook.ctx, hook.stripe)
    const [endpoint] = hook.state.webhookEndpoints
    expect(endpoint).toEqual(expect.objectContaining({
      url: HOOK_URL, metadata: labelOf(SERVICE), description: `owlmeans:${SERVICE}`,
    }))
    expect(row).toEqual(expect.objectContaining({ service: SERVICE, url: HOOK_URL, externalId: endpoint.id }))
    expect(await stripeWebhookSecret(hook.ctx)).toBe(endpoint.secret)

    const configuration = await ensurePortalConfiguration(hook.ctx, hook.stripe)
    expect(hook.state.portalConfigurations[0]).toEqual(expect.objectContaining({
      id: configuration, metadata: { ...labelOf(SERVICE), deployment: HOOK_URL },
    }))
    expect(hook.stores[RES_PAYMENT_FINGERPRINT].rows).toContainEqual(
      expect.objectContaining({ sku: `portal:${SERVICE}`, externalId: configuration }),
    )
  })

  test('the manager and the hook process share the rows: one URL, one secret, and a forced run from the manager creates nothing', async () => {
    const hook = await hookProcess({ bootstrap: false })
    const manager = await managerProcess({ manage: true, bootstrap: false })
    expect(webhookUrlOf(manager.ctx)).toBe(webhookUrlOf(hook.ctx))

    await bootstrapStripe(hook.ctx, hook.stripe)
    for (const alias of [RES_PAYMENT_WEBHOOK, RES_PAYMENT_FINGERPRINT]) {
      manager.stores[alias].rows.push(...structuredClone(hook.stores[alias].rows))
    }
    expect(await stripeWebhookSecret(manager.ctx)).toBe(hook.state.webhookEndpoints[0].secret)

    hook.state.calls.length = 0
    await bootstrapStripe(manager.ctx, hook.stripe, { force: true })
    expect(hook.state.calls).not.toContain('webhookEndpoints.create')
    expect(hook.state.calls).not.toContain('webhookEndpoints.del')
    expect(hook.state.calls).not.toContain('billingPortal.configurations.create')
    expect(hook.state.webhookEndpoints.map(({ url }) => url)).toEqual([HOOK_URL])
    expect(hook.state.portalConfigurations).toHaveLength(1)
  })

  test('a process booting with a new webhookService moves the owner\'s endpoint and re-creates the portal for the new key', async () => {
    const before = await makeFakeContext({ host: WEB, base: 'api', portal: PORTAL })
    const former = await ensureWebhookEndpoint(before.ctx, before.stripe)
    const formerPortal = await ensurePortalConfiguration(before.ctx, before.stripe)
    expect(former?.url).toBe(WEB_URL)

    const hook = await hookProcess({}, {
      seed: {
        [RES_PAYMENT_WEBHOOK]: before.stores[RES_PAYMENT_WEBHOOK].rows,
        [RES_PAYMENT_FINGERPRINT]: before.stores[RES_PAYMENT_FINGERPRINT].rows,
      },
      stripe: {
        seq: before.state.seq,
        webhookEndpoints: structuredClone(before.state.webhookEndpoints),
        portalConfigurations: structuredClone(before.state.portalConfigurations),
      },
    })
    await until(bootstrapped(hook, HOOK_URL))

    expect(hook.state.webhookEndpoints).toEqual([expect.objectContaining({ url: HOOK_URL, metadata: labelOf(SERVICE) })])
    expect(hook.state.webhookEndpoints[0].id).not.toBe(former?.externalId)
    expect(hook.stores[RES_PAYMENT_WEBHOOK].rows).toEqual([expect.objectContaining({ service: SERVICE, url: HOOK_URL })])
    expect(await stripeWebhookSecret(hook.ctx)).toBe(hook.state.webhookEndpoints[0].secret)

    const portal = hook.stores[RES_PAYMENT_FINGERPRINT].rows.find(row => row.sku === `portal:${SERVICE}`)
    expect(portal?.externalId).not.toBe(formerPortal)
    expect(hook.state.portalConfigurations.map(({ id, metadata }) => ({ id, metadata }))).toEqual([
      { id: formerPortal, metadata: { ...labelOf(SERVICE), deployment: WEB_URL } },
      { id: portal?.externalId, metadata: { ...labelOf(SERVICE), deployment: HOOK_URL } },
    ])
  })
})

describe('@owlmeans/server-payment — gateway options: bootstrap', () => {
  test('bootstrap: false skips the boot bootstrap, serves the portal, and still runs a forced bootstrap', async () => {
    const manager = await managerProcess({ manage: true, bootstrap: false })
    expect(gateway(manager.ctx)).toEqual(expect.objectContaining({ managed: true, bootstrap: false }))
    // A bootstrapping process booted after it is the clock: once it is done, the manager's would be too.
    const clock = await hookProcess()
    await until(bootstrapped(clock, HOOK_URL))
    expect(manager.state.calls).toEqual([])

    await paygateCustomers(manager.ctx).create({ paygate: 'stripe', externalId: 'cus_1', entityId: 'entity-1' })
    const link = await gateway(manager.ctx).portalLink(manager.ctx, 'entity-1', {
      flow: PortalFlow.Manage, returnUrl: PORTAL.returnUrl,
    })
    expect(link).toStartWith('https://billing.example.test/')
    expect(manager.state.portalConfigurations[0].metadata).toEqual({ ...labelOf(SERVICE), deployment: HOOK_URL })

    await bootstrapStripe(manager.ctx, await gateway(manager.ctx).stripe(manager.ctx), { force: true })
    expect(manager.state.webhookEndpoints).toEqual([expect.objectContaining({ url: HOOK_URL, metadata: labelOf(SERVICE) })])
    expect(manager.stores[RES_PAYMENT_WEBHOOK].rows).toEqual([expect.objectContaining({ service: SERVICE, url: HOOK_URL })])
  })

  test('refuses contradictory options at construction, and an undeclared webhook service only when bootstrapping', async () => {
    expect(() => makeGatewayService(undefined, { manage: false, bootstrap: true })).toThrow(PaygateError)
    expect(() => makeGatewayService(undefined, { owner: '' })).toThrow(PaygateError)
    expect(() => makeGatewayService(undefined, { webhookService: ' ' })).toThrow(PaygateError)

    await expect(makeFakeContext({ gateway: { manage: true, webhookService: HOOK_SERVICE } }))
      .rejects.toBeInstanceOf(WebhookSetupError)

    const quiet = await makeFakeContext({ gateway: { manage: true, bootstrap: false, webhookService: HOOK_SERVICE } })
    expect(() => webhookUrlOf(quiet.ctx)).toThrow(WebhookSetupError)
    const reader = await makeFakeContext({ gateway: { webhookService: HOOK_SERVICE } })
    expect(gateway(reader.ctx).webhookService).toBe(HOOK_SERVICE)
  })
})
