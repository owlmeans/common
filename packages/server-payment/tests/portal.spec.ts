import { describe, expect, test } from 'bun:test'
import { PortalFlow, PortalUnavailable, ProductType, PlanDuration, SubscriptionStatus } from '@owlmeans/payment'
import { declarePaymentPlan, declarePaymentProduct } from '../src/config.js'
import { createPortalLink, ensurePortalConfiguration } from '../src/plugins/portal.js'
import { fingerprints, paygateCustomers, subscriptions } from '../src/utils.js'
import { makeFakeContext, PLANS_PRODUCT, PRO, SERVICE, TEAM } from './fake-stripe.js'
import type { FakeContextOptions } from './fake-stripe.js'

const RETURN = 'https://app.example.com/billing'
const hookOf = (host: string): string => `https://${host}/payment-gate/webhook/stripe`
const tagOf = (host: string) => ({ owlmeans: 'payment', service: SERVICE, deployment: hookOf(host) })
const prices = [
  { id: 'price_pro', product: PLANS_PRODUCT, lookup_key: PRO, active: true, recurring: { interval: 'month' } },
  { id: 'price_team', product: PLANS_PRODUCT, lookup_key: TEAM, active: true, recurring: { interval: 'month' } },
  { id: 'price_old', product: PLANS_PRODUCT, lookup_key: null, active: false, recurring: { interval: 'month' } },
  { id: 'price_once', product: PLANS_PRODUCT, lookup_key: 'once', active: true, recurring: null },
]

const withPortal = async (opts: FakeContextOptions = {}) => await makeFakeContext({
  portal: { returnUrl: RETURN, headline: 'Plans', privacyPolicyUrl: 'https://example.com/privacy' },
  ...opts, stripe: { prices: structuredClone(prices), ...opts.stripe },
})

describe('@owlmeans/server-payment — portal configuration', () => {
  test('offers switching between active recurring prices and cancellation at period end; unchanged means no call', async () => {
    const fake = await withPortal()
    const id = await ensurePortalConfiguration(fake.ctx, fake.stripe)
    const [configuration] = fake.state.portalConfigurations

    expect(configuration.id).toBe(id)
    expect(configuration.features.subscription_update).toEqual({
      enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations',
      products: [{ product: PLANS_PRODUCT, prices: ['price_pro', 'price_team'] }],
    })
    expect(configuration.features.subscription_cancel).toEqual({ enabled: true, mode: 'at_period_end', proration_behavior: 'none' })
    expect(configuration.features.customer_update).toEqual({ enabled: true, allowed_updates: ['email', 'address', 'tax_id'] })
    expect(configuration).toEqual(expect.objectContaining({
      default_return_url: RETURN, metadata: tagOf('api.example.com'),
      business_profile: { headline: 'Plans', privacy_policy_url: 'https://example.com/privacy' },
    }))

    fake.state.calls.length = 0
    expect(await ensurePortalConfiguration(fake.ctx, fake.stripe)).toBe(id)
    expect(fake.state.calls).toEqual([])
  })

  test('re-adopts its own untracked configuration, and never an untagged one or one tagged for another deployment', async () => {
    const fake = await withPortal({
      stripe: {
        prices: structuredClone(prices),
        portalConfigurations: [
          { id: 'bpc_service_only', active: true, metadata: { owlmeans: 'payment', service: SERVICE } },
          { id: 'bpc_other', active: true, metadata: tagOf('other.example.com') },
        ],
      },
    })
    const id = await ensurePortalConfiguration(fake.ctx, fake.stripe)
    expect(id).not.toBe('bpc_service_only')
    expect(id).not.toBe('bpc_other')

    await fingerprints(fake.ctx).clear()
    fake.state.calls.length = 0
    expect(await ensurePortalConfiguration(fake.ctx, fake.stripe, { force: true })).toBe(id)
    expect(fake.state.calls).toEqual(['prices.list', 'billingPortal.configurations.list', 'billingPortal.configurations.update'])
    expect(fake.stores['payment-fingerprint'].rows).toEqual([
      expect.objectContaining({ sku: `portal:${SERVICE}`, externalId: id }),
    ])
    expect(fake.state.portalConfigurations.map(({ id, metadata, features }) => ({ id, metadata, features: features != null })))
      .toEqual([
        { id: 'bpc_service_only', metadata: { owlmeans: 'payment', service: SERVICE }, features: false },
        { id: 'bpc_other', metadata: tagOf('other.example.com'), features: false },
        { id, metadata: tagOf('api.example.com'), features: true },
      ])
  })

  test('two deployments on one Stripe account keep separate configurations, even when both rows name one', async () => {
    const shared = { owlmeans: 'payment', service: SERVICE }
    const stage = await withPortal({
      host: 'stage.example.com',
      stripe: { prices: structuredClone(prices), portalConfigurations: [{ id: 'bpc_shared', active: true, metadata: shared }] },
    })
    const staging = await withPortal({ host: 'staging.example.com' })
    for (const deployment of [stage, staging]) {
      await fingerprints(deployment.ctx).create({ sku: `portal:${SERVICE}`, hash: 'legacy', externalId: 'bpc_shared', updatedAt: new Date() })
    }

    expect(await ensurePortalConfiguration(stage.ctx, stage.stripe)).toBe('bpc_shared')
    const stagingId = await ensurePortalConfiguration(staging.ctx, stage.stripe)
    expect(stagingId).not.toBe('bpc_shared')
    expect(stage.state.portalConfigurations.map(({ id, metadata }) => ({ id, metadata }))).toEqual([
      { id: 'bpc_shared', metadata: tagOf('stage.example.com') },
      { id: stagingId, metadata: tagOf('staging.example.com') },
    ])

    for (const deployment of [stage, staging]) {
      await fingerprints(deployment.ctx).clear()
    }
    expect(await ensurePortalConfiguration(staging.ctx, stage.stripe, { force: true })).toBe(stagingId)
    expect(await ensurePortalConfiguration(stage.ctx, stage.stripe, { force: true })).toBe('bpc_shared')
    expect(stage.state.portalConfigurations).toHaveLength(2)

    const local = await withPortal({ host: 'localhost' })
    const localId = await ensurePortalConfiguration(local.ctx, stage.stripe)
    expect(stage.state.portalConfigurations.find(configuration => configuration.id === localId)?.metadata)
      .toEqual(tagOf('localhost'))
    expect(stage.state.portalConfigurations).toHaveLength(3)
  })

  test('disables both subscription features when nothing recurring is sold', async () => {
    const fake = await makeFakeContext({
      declare: cfg => {
        declarePaymentProduct(cfg, { sku: 'kit', type: ProductType.Simple, services: [SERVICE], name: 'Kit' })
        declarePaymentPlan(cfg, { productSku: 'kit', sku: 'kit-once', duration: PlanDuration.Lifetime, price: 5 })
      },
    })
    await ensurePortalConfiguration(fake.ctx, fake.stripe)
    expect(fake.state.portalConfigurations[0].features.subscription_update).toEqual({ enabled: false })
    expect(fake.state.portalConfigurations[0].features.subscription_cancel).toEqual({ enabled: false })
  })
})

describe('@owlmeans/server-payment — portal links', () => {
  const subscribed = async () => {
    const fake = await withPortal()
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_1', entityId: 'entity-1' })
    await subscriptions(fake.ctx).create({
      entityId: 'entity-1', planSku: PRO, productSku: PLANS_PRODUCT, service: SERVICE, paygate: 'stripe',
      externalId: 'sub_1', itemId: 'si_1', status: SubscriptionStatus.Active, rank: 10, createdAt: new Date(),
    })
    return fake
  }

  test('needs a customer; Manage opens the portal home on the managed configuration', async () => {
    const empty = await withPortal()
    await expect(createPortalLink(empty.ctx, empty.stripe, 'entity-1', { flow: PortalFlow.Manage, returnUrl: RETURN }))
      .rejects.toBeInstanceOf(PortalUnavailable)

    const fake = await subscribed()
    const url = await createPortalLink(fake.ctx, fake.stripe, 'entity-1', { flow: PortalFlow.Manage, returnUrl: RETURN })
    expect(url).toStartWith('https://billing.example.test/')
    expect(fake.state.portalSessions[0]).toEqual({
      customer: 'cus_1', return_url: RETURN, configuration: fake.state.portalConfigurations[0].id,
    })
  })

  test('PaymentMethod, Cancel and Update deep-link with a redirect back', async () => {
    const fake = await subscribed()
    const after = { type: 'redirect', redirect: { return_url: RETURN } }
    for (const flow of [PortalFlow.PaymentMethod, PortalFlow.Cancel, PortalFlow.Update]) {
      await createPortalLink(fake.ctx, fake.stripe, 'entity-1', { flow, returnUrl: RETURN })
    }
    expect(fake.state.portalSessions.map(session => session.flow_data)).toEqual([
      { type: 'payment_method_update', after_completion: after },
      { type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_1' }, after_completion: after },
      { type: 'subscription_update', subscription_update: { subscription: 'sub_1' }, after_completion: after },
    ])
  })

  test('Change confirms the stored item switching to the target plan price, as one item', async () => {
    const fake = await subscribed()
    await createPortalLink(fake.ctx, fake.stripe, 'entity-1', { flow: PortalFlow.Change, planSku: TEAM, returnUrl: RETURN })
    expect(fake.state.portalSessions[0].flow_data).toEqual({
      type: 'subscription_update_confirm',
      subscription_update_confirm: { subscription: 'sub_1', items: [{ id: 'si_1', price: 'price_team', quantity: 1 }] },
      after_completion: { type: 'redirect', redirect: { return_url: RETURN } },
    })
    await expect(createPortalLink(fake.ctx, fake.stripe, 'entity-1', { flow: PortalFlow.Change, returnUrl: RETURN }))
      .rejects.toBeInstanceOf(PortalUnavailable)
  })

  test('a subscription flow without an entitling paygate subscription is unavailable', async () => {
    const fake = await withPortal()
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_1', entityId: 'entity-1' })
    await subscriptions(fake.ctx).create({
      entityId: 'entity-1', planSku: PRO, productSku: PLANS_PRODUCT, service: SERVICE, paygate: 'stripe',
      externalId: 'sub_1', itemId: 'si_1', status: SubscriptionStatus.Canceled, rank: 10, createdAt: new Date(),
    })
    const refusal = await createPortalLink(fake.ctx, fake.stripe, 'entity-1', { flow: PortalFlow.Cancel, returnUrl: RETURN })
      .catch(error => error)
    expect(refusal).toBeInstanceOf(PortalUnavailable)
    expect(refusal.message).toContain('subscription')
  })
})
