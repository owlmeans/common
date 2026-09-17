import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { makeSecurityHelper } from '@owlmeans/config'
import type { CommonServiceRoute } from '@owlmeans/route'
import { normalizePath } from '@owlmeans/route'
import { WebhookSetupError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  paymentGate, STRIPE_OWNER_KEY, STRIPE_OWNER_VALUE, STRIPE_PAYGATE_ALIAS, WEBHOOK_EVENTS,
} from '../consts.js'
import { apiVersionOf, isDuplicateKey, isMissingObject, paymentWebhooks, stripeConfig } from '../utils.js'
import type { PaymentWebhookRecord } from '../types.js'

/** The path the webhook route answers for one paygate: `/<base>/webhook/<paygate>`. */
export const webhookPathOf = (paygate: string): string =>
  '/' + normalizePath(normalizePath(paymentGate.base.route.route.path) + '/'
    + normalizePath(paymentGate.webhook.route.route.path).replace(':paygate', paygate))

/** This deployment's public webhook URL for a paygate. */
export const webhookUrlOf = (ctx: ApiContext, paygate: string = STRIPE_PAYGATE_ALIAS): string => {
  const route = ctx.cfg.services?.[ctx.cfg.service] as CommonServiceRoute | undefined
  if (route == null) {
    throw new WebhookSetupError(`service:${ctx.cfg.service}`)
  }

  return makeSecurityHelper(ctx as never).makeUrl(route, webhookPathOf(paygate))
}

/** A URL a paygate can deliver to: https on a public, dotted host name. */
export const isDeliverableUrl = (url: string): boolean => {
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
const ownerMetadata = (service: string): Record<string, string> =>
  ({ [STRIPE_OWNER_KEY]: STRIPE_OWNER_VALUE, service })

const hashOf = (url: string, apiVersion: string, events: string[]): string =>
  createHash('sha256').update(JSON.stringify({ url, apiVersion, events })).digest('hex')

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
    if (!isMissingObject(error)) {
      throw error
    }
  }
}

/** Field-encrypt the secret where the database is configured for it; store it plain otherwise. */
const sealed = async (row: Partial<PaymentWebhookRecord>, ctx: ApiContext): Promise<Partial<PaymentWebhookRecord>> => {
  const resource = paymentWebhooks(ctx)
  if (typeof resource.lock !== 'function') {
    return row
  }
  try {
    return await resource.lock(row, ['secret']) as Partial<PaymentWebhookRecord>
  } catch {
    return row
  }
}

const opened = async (row: PaymentWebhookRecord, ctx: ApiContext): Promise<string> => {
  const resource = paymentWebhooks(ctx)
  if (typeof resource.unlock !== 'function') {
    return row.secret
  }
  try {
    return (await resource.unlock(row, ['secret']) as PaymentWebhookRecord).secret
  } catch {
    return row.secret
  }
}

export interface EnsureWebhookOptions {
  /** Verify the stored endpoint still exists even when nothing changed locally. */
  force?: boolean
}

/**
 * Delete the endpoints this deployment created at URLs it has left: each `payment-webhook` row of
 * this paygate and service at another URL drops the endpoint it names (one already gone is fine),
 * then the row itself. `live` — the endpoint just put in place — is never dropped.
 */
const pruneFormerUrls = async (
  ctx: ApiContext, stripe: Stripe, service: string, url: string, live: string,
): Promise<void> => {
  const resource = paymentWebhooks(ctx)
  const { items } = await resource.list(
    { paygate: STRIPE_PAYGATE_ALIAS, service, url: { $ne: url } }, { size: 0 },
  )
  for (const row of items) {
    if (row.externalId !== live) {
      await dropEndpoint(stripe, row.externalId)
    }
    await resource.delete(row.id as string)
  }
}

/**
 * Keep exactly one Stripe webhook endpoint for this deployment at its own URL, subscribed to
 * `WEBHOOK_EVENTS` on the client's API version, and persist its signing secret — which Stripe
 * returns only when an endpoint is created.
 *
 * A deployment's identity is its webhook URL. Several deployments of one service may share a Stripe
 * account — a test-mode account commonly serves every non-production deployment — each with its own
 * database and URL, so a deployment deletes only the endpoints its own `payment-webhook` rows name.
 *
 * - A URL Stripe cannot deliver to (not https, a loopback or dotless host) is skipped.
 * - An unchanged `{ url, apiVersion, events }` fingerprint makes no paygate call at all.
 * - `force` first verifies the stored endpoint still exists; one deleted from outside loses its row
 *   and is created again.
 * - Changed events on the same API version update the endpoint in place.
 * - A changed API version (create-only on an endpoint) deletes and recreates it.
 * - An endpoint already at this exact URL that no row names is replaced: its secret is unknown here.
 * - A row of this paygate and service at another URL is a URL this deployment has left: once the
 *   endpoint at the current URL is in place, the endpoint that row names is deleted (already gone is
 *   fine), then the row.
 * - An endpoint at another URL that no row of this deployment names belongs to another deployment
 *   and is never deleted — whatever its metadata says.
 * - Replicas racing to persist one row: the endpoint created last is the live one.
 * - A created endpoint carries `{ owlmeans: 'payment', service }` metadata for operators.
 */
export const ensureWebhookEndpoint = async (
  ctx: ApiContext, stripe: Stripe, opts: EnsureWebhookOptions = {},
): Promise<PaymentWebhookRecord | null> => {
  const url = webhookUrlOf(ctx)
  if (!isDeliverableUrl(url)) {
    console.info(`[payment] webhook endpoint not managed: "${url}" is not a public https URL`)
    return null
  }
  const service = ctx.cfg.service
  const apiVersion = apiVersionOf(stripe)
  const events = [...WEBHOOK_EVENTS].sort()
  const hash = hashOf(url, apiVersion, events)
  const resource = paymentWebhooks(ctx)
  const description = `owlmeans:${service}`
  const metadata = ownerMetadata(service)
  const now = new Date()

  let stored = await resource.load({ paygate: STRIPE_PAYGATE_ALIAS, service, url })
  if (stored != null && opts.force === true) {
    try {
      await stripe.webhookEndpoints.retrieve(stored.externalId)
    } catch (error) {
      if (!isMissingObject(error)) {
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
      if (!isMissingObject(error)) {
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
      paygate: STRIPE_PAYGATE_ALIAS, service, url, externalId: created.id, secret: created.secret,
      apiVersion, events, hash, createdAt: stored?.createdAt ?? now, updatedAt: now,
    }, ctx)
    try {
      live = stored != null
        ? await resource.update({ ...row, id: stored.id } as PaymentWebhookRecord)
        : await resource.create(row)
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error
      }
      // Another replica persisted its endpoint meanwhile; the one created last is the live one.
      const winner = await resource.load({ paygate: STRIPE_PAYGATE_ALIAS, service, url })
      live = await resource.update({ ...row, id: winner?.id } as PaymentWebhookRecord)
    }
  }

  await pruneFormerUrls(ctx, stripe, service, url, live.externalId)

  return live
}

/**
 * The secrets a Stripe signature may be verified with, in order: the configured file secret (an
 * override), then the one stored for the managed endpoint.
 */
export const stripeWebhookSecrets = async (ctx: ApiContext): Promise<string[]> => {
  const secrets: string[] = []
  const configured = await stripeConfig(ctx).then(config => config.webhook, () => undefined)
  if (typeof configured === 'string' && configured.trim() !== '') {
    secrets.push(configured.trim())
  }
  const stored = await paymentWebhooks(ctx).load(
    { paygate: STRIPE_PAYGATE_ALIAS, service: ctx.cfg.service },
    { sort: [{ field: 'updatedAt', order: 'desc' }] },
  )
  if (stored != null) {
    const secret = await opened(stored, ctx)
    if (secret !== '' && !secrets.includes(secret)) {
      secrets.push(secret)
    }
  }

  return secrets
}

/** The secret a Stripe signature is verified with. @throws WebhookSetupError('secret') */
export const stripeWebhookSecret = async (ctx: ApiContext): Promise<string> => {
  const [secret] = await stripeWebhookSecrets(ctx)
  if (secret == null) {
    throw new WebhookSetupError('secret')
  }

  return secret
}
