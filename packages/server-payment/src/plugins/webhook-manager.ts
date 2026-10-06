import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { makeSecurityHelper } from '@owlmeans/config'
import { type CommonServiceRoute, normalizePath } from '@owlmeans/route'
import { WebhookSetupError, PaygateSignatureError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import {
  STRIPE_OWNER_KEY, STRIPE_OWNER_VALUE, STRIPE_PAYGATE_ALIAS, WEBHOOK_EVENTS, STRIPE_SIGNATURE,
} from '../consts.js'
import type { PaymentWebhookRecord } from '../types.js'
import { log } from '../log.js'
import type { EnsureWebhookOptions, WebhookHelper } from './webhook-manager/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { paymentGate } from '../protocol.js'
import { createEventHandler } from './events.js'
import type { WebhookRequest } from './types.local.js'

/** The path the webhook route answers for one paygate: `/<base>/webhook/<paygate>`. */
const webhookPathOf = (paygate: string): string =>
  '/' + normalizePath(normalizePath(paymentGate.base.route.route.path) + '/'
    + normalizePath(paymentGate.webhook.route.route.path).replace(':paygate', paygate))

/** A URL a paygate can deliver to: https on a public, dotted host name. */
const isDeliverableUrl = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()

  return parsed.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
    && !host.endsWith('.local') && host.includes('.')
}

/** An operator's label on an endpoint this package created — never evidence of which deployment owns it. */
const ownerMetadata = (owner: string): Record<string, string> =>
  ({ [STRIPE_OWNER_KEY]: STRIPE_OWNER_VALUE, service: owner })

const hashOf = (url: string, apiVersion: string, events: string[]): string =>
  createHash('sha256').update(JSON.stringify({ url, apiVersion, events })).digest('hex')

export const makeWebhookHelper = (ctx: ApiContext): WebhookHelper => {
  const access = paymentAccessOf(ctx)

  const webhookServiceOf = (): string => access.gatewayOf()?.webhookService ?? ctx.cfg.service

  const gatewayOwnerOf = (): string => access.gatewayOf()?.owner ?? ctx.cfg.service

  const webhookRouteOf = (alias: string = webhookServiceOf()): CommonServiceRoute => {
    const route = ctx.cfg.services?.[alias] as CommonServiceRoute | undefined
    if (route == null) {
      throw new WebhookSetupError(`service:${alias}`)
    }

    return route
  }

  const webhookUrlOf = (paygate: string = STRIPE_PAYGATE_ALIAS): string =>
    makeSecurityHelper(ctx as never).makeUrl(webhookRouteOf(), webhookPathOf(paygate))

  const listEndpoints = async (stripe: Stripe): Promise<Stripe.WebhookEndpoint[]> => {
    const endpoints: Stripe.WebhookEndpoint[] = []
    let startingAfter: string | undefined
    for (;;) {
      const page = await stripe.webhookEndpoints.list({
        limit: 100, ...(startingAfter != null ? { starting_after: startingAfter } : {}),
      })
      endpoints.push(...page.data)
      if (!page.has_more || page.data.length === 0) {
        return endpoints
      }
      startingAfter = page.data[page.data.length - 1].id
    }
  }

  const dropEndpoint = async (stripe: Stripe, id: string): Promise<void> => {
    try {
      await stripe.webhookEndpoints.del(id)
    } catch (error) {
      if (!paymentUtils.isMissingObject(error)) {
        throw error
      }
    }
  }

  /** Field-encrypt the secret where the database is configured for it; store it plain otherwise. */
  const sealed = async (row: Partial<PaymentWebhookRecord>): Promise<Partial<PaymentWebhookRecord>> => {
    const resource = access.paymentWebhooks()
    if (typeof resource.lock !== 'function') {
      return row
    }
    try {
      return await resource.lock(row, ['secret']) as Partial<PaymentWebhookRecord>
    } catch {
      return row
    }
  }

  const opened = async (row: PaymentWebhookRecord): Promise<string> => {
    const resource = access.paymentWebhooks()
    if (typeof resource.unlock !== 'function') {
      return row.secret
    }
    try {
      return (await resource.unlock(row, ['secret']) as PaymentWebhookRecord).secret
    } catch {
      return row.secret
    }
  }

  /**
   * Delete the endpoints this deployment created at URLs it has left: each `payment-webhook` row of
   * this paygate and owner at another URL drops the endpoint it names (one already gone is fine),
   * then the row itself. `live` — the endpoint just put in place — is never dropped.
   */
  const pruneFormerUrls = async (stripe: Stripe, owner: string, url: string, live: string): Promise<void> => {
    const resource = access.paymentWebhooks()
    const { items } = await resource.list(
      { paygate: STRIPE_PAYGATE_ALIAS, service: owner, url: { $ne: url } }, { size: 0 },
    )
    for (const row of items) {
      if (row.externalId !== live) {
        await dropEndpoint(stripe, row.externalId)
      }
      await resource.delete(row.id as string)
    }
  }

  const ensureWebhookEndpoint = async (
    stripe: Stripe, opts: EnsureWebhookOptions = {},
  ): Promise<PaymentWebhookRecord | null> => {
    const url = webhookUrlOf()
    if (!isDeliverableUrl(url)) {
      log.info('Webhook endpoint not managed: not a public https URL', { url }, { event: 'payment.webhook.unmanaged' })
      return null
    }
    const owner = gatewayOwnerOf()
    const apiVersion = paymentUtils.apiVersionOf(stripe)
    const events = [...WEBHOOK_EVENTS].sort()
    const hash = hashOf(url, apiVersion, events)
    const resource = access.paymentWebhooks()
    const description = `owlmeans:${owner}`
    const metadata = ownerMetadata(owner)
    const now = new Date()

    let stored = await resource.load({ paygate: STRIPE_PAYGATE_ALIAS, service: owner, url })
    if (stored != null && opts.force === true) {
      try {
        await stripe.webhookEndpoints.retrieve(stored.externalId)
      } catch (error) {
        if (!paymentUtils.isMissingObject(error)) {
          throw error
        }
        await resource.delete(stored.id as string)
        stored = null
      }
    }
    if (stored != null && stored.hash === hash && opts.force !== true) {
      return stored
    }

    let live: PaymentWebhookRecord | null = null
    if (stored != null && stored.apiVersion === apiVersion) {
      try {
        await stripe.webhookEndpoints.update(stored.externalId, {
          url, enabled_events: events as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
          description, metadata, disabled: false,
        })
        live = await resource.update({ ...stored, events, hash, updatedAt: now })
      } catch (error) {
        if (!paymentUtils.isMissingObject(error)) {
          throw error
        }
      }
    }

    if (live == null) {
      if (stored != null) {
        await dropEndpoint(stripe, stored.externalId)
      }
      for (const endpoint of await listEndpoints(stripe)) {
        if (endpoint.url === url) {
          await dropEndpoint(stripe, endpoint.id)
        }
      }

      const created = await stripe.webhookEndpoints.create({
        url, enabled_events: events as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
        api_version: apiVersion as Stripe.WebhookEndpointCreateParams.ApiVersion, description, metadata,
      })
      if (created.secret == null || created.secret === '') {
        throw new WebhookSetupError('secret-missing')
      }

      const row = await sealed({
        paygate: STRIPE_PAYGATE_ALIAS, service: owner, url, externalId: created.id, secret: created.secret,
        apiVersion, events, hash, createdAt: stored?.createdAt ?? now, updatedAt: now,
      })
      try {
        live = stored != null
          ? await resource.update({ ...row, id: stored.id } as PaymentWebhookRecord)
          : await resource.create(row)
      } catch (error) {
        if (!paymentUtils.isDuplicateKey(error)) {
          throw error
        }
        // Another replica persisted its endpoint meanwhile; the one created last is the live one.
        const winner = await resource.load({ paygate: STRIPE_PAYGATE_ALIAS, service: owner, url })
        live = await resource.update({ ...row, id: winner?.id } as PaymentWebhookRecord)
      }
    }

    await pruneFormerUrls(stripe, owner, url, live.externalId)

    return live
  }

  const stripeWebhookSecrets = async (): Promise<string[]> => {
    const secrets: string[] = []
    const configured = await access.stripeConfig().then(config => config.webhook, () => undefined)
    if (typeof configured === 'string' && configured.trim() !== '') {
      secrets.push(configured.trim())
    }
    const stored = await access.paymentWebhooks().load(
      { paygate: STRIPE_PAYGATE_ALIAS, service: gatewayOwnerOf() },
      { sort: [{ field: 'updatedAt', order: 'desc' }] },
    )
    if (stored != null) {
      const secret = await opened(stored)
      if (secret !== '' && !secrets.includes(secret)) {
        secrets.push(secret)
      }
    }

    return secrets
  }

  const stripeWebhookSecret = async (): Promise<string> => {
    const [secret] = await stripeWebhookSecrets()
    if (secret == null) {
      throw new WebhookSetupError('secret')
    }

    return secret
  }

  const handleStripeWebhook = async (stripe: Stripe, request: unknown): Promise<void> => {
    const typed = request as WebhookRequest
    const rawBody = typed.original?.rawBody ?? typed.rawBody
    const signature = typed.headers[STRIPE_SIGNATURE.toLowerCase()]
    if (rawBody == null || typeof signature !== 'string') throw new PaygateSignatureError()

    const secrets = await stripeWebhookSecrets()
    if (secrets.length === 0) {
      throw new WebhookSetupError('secret')
    }
    let event: Stripe.Event | null = null
    for (const secret of secrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret)
        break
      } catch {
        // Try the next secret; a signature none of them verifies is refused below.
      }
    }
    if (event == null) {
      throw new PaygateSignatureError()
    }

    await createEventHandler(ctx, stripe).process(event)
  }

  return {
    webhookServiceOf, gatewayOwnerOf, webhookRouteOf, webhookUrlOf, ensureWebhookEndpoint, stripeWebhookSecrets,
    stripeWebhookSecret, handleStripeWebhook,
  }
}

/** The webhook endpoint of a context — one per context. */
export const webhookOf = memoHelper.oncePer(makeWebhookHelper)

/** @deprecated compat:factory-refactor — use `webhookOf(ctx).webhookUrlOf(…)` */
export const webhookUrlOf = (ctx: ApiContext, paygate: string = STRIPE_PAYGATE_ALIAS): string =>
  webhookOf(ctx).webhookUrlOf(paygate)
