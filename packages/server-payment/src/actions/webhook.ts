import { PaygateError, UnknownPaygate } from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import type { Context } from '../types.js'
import { paymentAccessOf } from '../access.js'
import { paymentGate } from '../protocol.js'
import { paygatesOf } from '../paygate/registry.js'
import { webhookOf } from '../plugins/webhook-manager.js'

const bind = handlers<Context>()

/**
 * A paygate delivery: the paygate named in the path must be registered (`UnknownPaygate`), and only a
 * managed gateway receives one; the paygate verifies it against the `owner`'s secrets.
 */
export const webhook = bind.params(paymentGate.webhook, async ({ paygate }, context, request) => {
  const target = paygatesOf(context).find(paygate)
  if (target == null) throw new UnknownPaygate(paygate)
  const service = paymentAccessOf(context).gateway()
  if (!service.managed) throw new PaygateError('unmanaged')
  await webhookOf(context).handleDelivery(target, request)
})
