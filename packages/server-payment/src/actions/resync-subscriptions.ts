import { handlers } from '@owlmeans/server-api'
import { paymentGate } from '../consts.js'
import { gateway } from '../utils.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

/** Re-read every live paygate subscription — the manually or periodically triggered repair. */
export const resyncSubscriptions = bind.request(paymentGate.resyncSubscriptions, async (_request, context) =>
  await gateway(context).resyncAll(context))
