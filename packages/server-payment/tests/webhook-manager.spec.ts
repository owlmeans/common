import { describe, expect, test } from 'bun:test'
import { WebhookSetupError } from '@owlmeans/payment'
import { STRIPE_SIGNATURE, WEBHOOK_EVENTS } from '../src/consts.js'
import { handleStripeWebhook } from '../src/plugins/stripe.js'
import {
  ensureWebhookEndpoint, stripeWebhookSecret, webhookUrlOf,
} from '../src/plugins/webhook-manager.js'
import { HOST, makeFakeContext, SDK_API_VERSION, SERVICE } from './fake-stripe.js'

const URL = 'https://api.example.com/payment-gate/webhook/stripe'
const ours = { owlmeans: 'payment', service: SERVICE }

describe('@owlmeans/server-payment — webhook endpoint management', () => {
  test('skips a URL Stripe cannot deliver to without calling Stripe', async () => {
    for (const host of ['localhost', '127.0.0.1', 'api', 'payments.local']) {
      const fake = await makeFakeContext({ host })
      expect(await ensureWebhookEndpoint(fake.ctx, fake.stripe)).toBeNull()
      expect(fake.state.calls).toEqual([])
    }
    const plain = await makeFakeContext()
    ;(plain.ctx.cfg as { security?: { unsecure?: boolean } }).security = { unsecure: true }
    expect(await ensureWebhookEndpoint(plain.ctx, plain.stripe)).toBeNull()
    expect(plain.state.calls).toEqual([])
  })

  test('creates the endpoint on the client API version, persists its secret, makes no call while nothing changed, and a forced run recreates it once deleted from outside', async () => {
    const fake = await makeFakeContext()
    expect(webhookUrlOf(fake.ctx)).toBe(URL)

    const row = await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual(['webhookEndpoints.list', 'webhookEndpoints.create'])
    const [endpoint] = fake.state.webhookEndpoints
    expect(endpoint).toEqual(expect.objectContaining({
      url: URL, api_version: SDK_API_VERSION, enabled_events: [...WEBHOOK_EVENTS].sort(), metadata: ours,
      description: `owlmeans:${SERVICE}`,
    }))
    expect(row).toEqual(expect.objectContaining({
      externalId: endpoint.id, secret: endpoint.secret, apiVersion: SDK_API_VERSION, url: URL,
    }))

    fake.state.calls.length = 0
    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual([])

    fake.state.webhookEndpoints = []
    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual([])

    const healed = await ensureWebhookEndpoint(fake.ctx, fake.stripe, { force: true })
    expect(fake.state.calls).toEqual(['webhookEndpoints.retrieve', 'webhookEndpoints.list', 'webhookEndpoints.create'])
    const [recreated] = fake.state.webhookEndpoints
    expect(recreated).toEqual(expect.objectContaining({ id: healed?.externalId, url: URL, metadata: ours }))
    expect(fake.stores['payment-webhook'].rows).toEqual([
      expect.objectContaining({ url: URL, externalId: recreated.id, secret: recreated.secret }),
    ])
  })

  test('updates changed events in place, and recreates the endpoint for a new API version', async () => {
    const fake = await makeFakeContext()
    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    const stored = fake.stores['payment-webhook'].rows[0]
    const firstSecret = stored.secret
    stored.hash = 'events-of-an-older-release'
    fake.state.calls.length = 0

    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual(['webhookEndpoints.update'])
    expect(fake.stores['payment-webhook'].rows[0].secret).toBe(firstSecret)

    fake.state.apiVersion = '2099-01-01.future'
    fake.state.calls.length = 0
    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual(['webhookEndpoints.del', 'webhookEndpoints.list', 'webhookEndpoints.create'])
    expect(fake.state.webhookEndpoints).toHaveLength(1)
    expect(fake.state.webhookEndpoints[0].api_version).toBe('2099-01-01.future')
    expect(fake.stores['payment-webhook'].rows).toHaveLength(1)
    expect(fake.stores['payment-webhook'].rows[0].secret).not.toBe(firstSecret)
  })

  test('leaves another deployment\'s endpoint in a shared account alone, and replaces an untracked one at its own URL', async () => {
    const STAGE_URL = 'https://stage.example.com/payment-gate/webhook/stripe'
    const STAGING_URL = 'https://staging.example.com/payment-gate/webhook/stripe'
    const stage = await makeFakeContext({
      host: 'stage.example.com',
      stripe: {
        webhookEndpoints: [{ id: 'we_manual', url: STAGING_URL, metadata: {}, enabled_events: ['*'], secret: 'whsec_manual' }],
      },
    })
    const staging = await makeFakeContext({ host: 'staging.example.com' })

    const stageRow = await ensureWebhookEndpoint(stage.ctx, stage.stripe)
    const stagingRow = await ensureWebhookEndpoint(staging.ctx, stage.stripe)
    expect(stage.state.webhookEndpoints.map(({ id, url, metadata }) => ({ id, url, metadata }))).toEqual([
      { id: stageRow?.externalId, url: STAGE_URL, metadata: ours },
      { id: stagingRow?.externalId, url: STAGING_URL, metadata: ours },
    ])

    stage.state.calls.length = 0
    expect(await ensureWebhookEndpoint(stage.ctx, stage.stripe, { force: true }))
      .toEqual(expect.objectContaining({ externalId: stageRow?.externalId, secret: stageRow?.secret }))
    expect(stage.state.calls).toEqual(['webhookEndpoints.retrieve', 'webhookEndpoints.update'])
  })

  test('after a URL change, drops the endpoints its own former rows name and removes those rows', async () => {
    const fake = await makeFakeContext({ host: 'old.example.com' })
    const former = await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    fake.stores['payment-webhook'].rows.push({
      id: 'older-row', paygate: 'stripe', service: SERVICE, url: 'https://older.example.com/payment-gate/webhook/stripe',
      externalId: 'we_gone', secret: 'whsec_gone', apiVersion: SDK_API_VERSION, events: [], hash: 'x', createdAt: new Date(),
    })
    ;(fake.ctx.cfg.services?.[SERVICE] as { host: string }).host = HOST
    fake.state.calls.length = 0

    const moved = await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    expect(moved).toEqual(expect.objectContaining({ url: URL }))
    expect(fake.state.calls).toEqual([
      'webhookEndpoints.list', 'webhookEndpoints.create', 'webhookEndpoints.del', 'webhookEndpoints.del',
    ])
    expect(fake.state.webhookEndpoints.map(endpoint => endpoint.id)).toEqual([moved?.externalId])
    expect(moved?.externalId).not.toBe(former?.externalId)
    expect(fake.stores['payment-webhook'].rows).toEqual([expect.objectContaining({ url: URL, externalId: moved?.externalId })])
  })
})

describe('@owlmeans/server-payment — webhook secret', () => {
  test('resolves the configured secret first, then the stored one, else fails setup', async () => {
    const bare = await makeFakeContext()
    await expect(stripeWebhookSecret(bare.ctx)).rejects.toBeInstanceOf(WebhookSetupError)

    await ensureWebhookEndpoint(bare.ctx, bare.stripe)
    expect(await stripeWebhookSecret(bare.ctx)).toBe(bare.state.webhookEndpoints[0].secret)

    const configured = await makeFakeContext({ webhookSecret: 'whsec_file' })
    await ensureWebhookEndpoint(configured.ctx, configured.stripe)
    expect(await stripeWebhookSecret(configured.ctx)).toBe('whsec_file')
  })

  test('verifies a delivery with either secret, and refuses a signature neither verifies', async () => {
    const fake = await makeFakeContext({ webhookSecret: 'whsec_file' })
    await ensureWebhookEndpoint(fake.ctx, fake.stripe)
    const stored = fake.state.webhookEndpoints[0].secret
    const body = JSON.stringify({ id: 'evt_1', type: 'customer.created', data: { object: { id: 'cus_9', metadata: { entityId: 'e9' } } } })
    const deliver = async (signature: string) => await handleStripeWebhook(fake.ctx, fake.stripe, {
      rawBody: body, headers: { [STRIPE_SIGNATURE.toLowerCase()]: signature },
    })

    await deliver(`sig:${stored}`)
    await deliver('sig:whsec_file')
    expect(fake.stores['payment-paygate-customer'].rows).toHaveLength(1)
    await expect(deliver('sig:whsec_forged')).rejects.toThrow('signature')
  })
})
