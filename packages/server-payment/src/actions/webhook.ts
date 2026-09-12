import { UnknownPaygate } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { paymentGate, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { stripePlugin } from '../plugins/stripe.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

export const webhook = bind.params(paymentGate.webhook, async ({ paygate }, context, request) => {
  if (paygate !== STRIPE_PAYGATE_ALIAS) throw new UnknownPaygate(paygate)
  await stripePlugin.handleWebhook(request, context)
})
