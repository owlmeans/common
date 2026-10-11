import { handlers } from '@owlmeans/server-api'
import type { Context } from '../types.js'
import { paymentAccessOf } from '../access.js'
import { paymentGate } from '../protocol.js'

const bind = handlers<Context>()

/** Re-read every live paygate subscription — the manually or periodically triggered repair. */
export const resyncSubscriptions = bind.request(paymentGate.resyncSubscriptions, async (_request, context) =>
  await paymentAccessOf(context).gateway().resyncAll(context))
