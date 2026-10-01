import { PaygateError } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import { paymentGate } from '../consts.js'
import { bootstrapStripe } from '../service.js'
import { fingerprints, gateway } from '../utils.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

/**
 * Forget every sync fingerprint and bring Stripe back to the declared catalogue, portal and webhook —
 * in any managed process, `bootstrap: false` included: the webhook URL and the rows follow the
 * gateway's `webhookService` and `owner`, so every process of the owner converges on one state.
 */
export const resync = bind.request(paymentGate.resync, async (_request, context) => {
  const service = gateway(context)
  if (!service.managed) throw new PaygateError('unmanaged')
  await fingerprints(context).clear()
  await bootstrapStripe(context, await service.stripe(context), { force: true })
  return { ok: true }
})
