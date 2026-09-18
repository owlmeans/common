import { PaygateError } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { paymentGate } from '../consts.js'
import { bootstrapStripe } from '../service.js'
import { fingerprints, gateway, stripeClient } from '../utils.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

/** Forget every sync fingerprint and bring Stripe back to the declared catalogue, portal and webhook. */
export const resync = bind.request(paymentGate.resync, async (_request, context) => {
  if (!gateway(context).managed) throw new PaygateError('unmanaged')
  await fingerprints(context).clear()
  await bootstrapStripe(context, await stripeClient(context), { force: true })
  return { ok: true }
})
