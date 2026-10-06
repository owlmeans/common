import { PaygateError, UnknownPaygate } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type { Context } from '../types.js'
import { paymentAccessOf } from '../access.js'
import { paymentGate } from '../protocol.js'
import { webhookOf } from '../plugins/webhook-manager.js'

const bind = handlers<Context>()

/** A Stripe delivery — only a managed gateway receives one; its secret is the `owner`'s stored one. */
export const webhook = bind.params(paymentGate.webhook, async ({ paygate }, context, request) => {
  if (paygate !== STRIPE_PAYGATE_ALIAS) throw new UnknownPaygate(paygate)
  const service = paymentAccessOf(context).gateway()
  if (!service.managed) throw new PaygateError('unmanaged')
  await webhookOf(context).handleStripeWebhook(await service.stripe(context), request)
})
