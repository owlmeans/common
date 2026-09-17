import { PaygateError, UnknownPaygate } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { paymentGate, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { handleStripeWebhook } from '../plugins/stripe.js'
import { gateway, stripeClient } from '../utils.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

export const webhook = bind.params(paymentGate.webhook, async ({ paygate }, context, request) => {
  if (paygate !== STRIPE_PAYGATE_ALIAS) throw new UnknownPaygate(paygate)
  if (!gateway(context).managed) throw new PaygateError('unmanaged')
  await handleStripeWebhook(context, await stripeClient(context), request)
})
