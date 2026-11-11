import { makeSecurityHelper } from '@owlmeans/config'
import { type CommonServiceRoute, normalizePath } from '@owlmeans/route'
import { PaygateError, WebhookSetupError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaymentWebhookRecord } from '../types.js'
import type { Paygate, PaygateDeployment } from '../paygate/types.js'
import { log } from '../log.js'
import type { EnsureWebhookOptions, WebhookHelper } from './webhook-manager/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentGate } from '../protocol.js'
import { paymentEventsOf } from './events.js'
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

  const webhookUrlOf = (paygate: string): string =>
    makeSecurityHelper(ctx as never).makeUrl(webhookRouteOf(), webhookPathOf(paygate))

  const deploymentOf = (paygate: string): PaygateDeployment => ({ owner: gatewayOwnerOf(), webhookUrl: webhookUrlOf(paygate) })

  const ensureWebhookEndpoint = async (
    paygate: Paygate, opts: EnsureWebhookOptions = {},
  ): Promise<PaymentWebhookRecord | null> => {
    if (paygate.webhook == null) {
      return null
    }
    const deployment = deploymentOf(paygate.id)
    if (!isDeliverableUrl(deployment.webhookUrl)) {
      log.info('Webhook endpoint not managed: not a public https URL', { url: deployment.webhookUrl, paygate: paygate.id }, { event: 'payment.webhook.unmanaged' })
      return null
    }

    return await paygate.webhook.ensureEndpoint(deployment, opts)
  }

  const handleDelivery = async (paygate: Paygate, request: unknown): Promise<void> => {
    if (paygate.webhook == null) {
      throw new PaygateError('capability:webhook')
    }
    const typed = request as WebhookRequest
    const events = await paygate.webhook.verify(
      { rawBody: typed.original?.rawBody ?? typed.rawBody, headers: typed.headers ?? {} }, { owner: gatewayOwnerOf() },
    )
    for (const event of events) {
      await paymentEventsOf(ctx).apply(paygate, event)
    }
  }

  return {
    webhookServiceOf, gatewayOwnerOf, webhookRouteOf, webhookUrlOf, deploymentOf, ensureWebhookEndpoint, handleDelivery,
  }
}

/** The paygate webhooks of a context — one per context. */
export const webhookOf = memoHelper.oncePer(makeWebhookHelper)

/** @deprecated compat:factory-refactor — use `webhookOf(ctx).webhookUrlOf(paygate)` */
export const webhookUrlOf = (ctx: ApiContext, paygate: string): string => webhookOf(ctx).webhookUrlOf(paygate)
