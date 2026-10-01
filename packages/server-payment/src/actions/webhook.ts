import { PaygateError, UnknownPaygate } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { paymentGate, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { handleStripeWebhook } from '../plugins/stripe.js'
import { gateway } from '../utils.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

/** A Stripe delivery — only a managed gateway receives one; its secret is the `owner`'s stored one. */
export const webhook = bind.params(paymentGate.webhook, async ({ paygate }, context, request) => {
  if (paygate !== STRIPE_PAYGATE_ALIAS) throw new UnknownPaygate(paygate)
  const service = gateway(context)
  if (!service.managed) throw new PaygateError('unmanaged')
  await handleStripeWebhook(context, await service.stripe(context), request)
})
