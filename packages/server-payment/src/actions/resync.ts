import { PaygateError } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import type { Context } from '../types.js'
import { paymentAccessOf } from '../access.js'
import { paymentGate } from '../protocol.js'
import { paygateBootstrapOf } from '../bootstrap.js'

const bind = handlers<Context>()

/**
 * Forget every sync fingerprint and bring every paygate back to the declared catalogue, portal and
 * webhook — in any managed process, `bootstrap: false` included: the webhook URL and the rows follow
 * the gateway's `webhookService` and `owner`, so every process of the owner converges on one state.
 */
export const resync = bind.request(paymentGate.resync, async (_request, context) => {
  const paymentAccess = paymentAccessOf(context)
  const service = paymentAccess.gateway()
  if (!service.managed) throw new PaygateError('unmanaged')
  await paymentAccess.fingerprints().clear()
  await paygateBootstrapOf(context).bootstrap({ force: true })
  return { ok: true }
})
