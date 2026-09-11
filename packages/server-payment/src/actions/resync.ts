import { handlers } from '@owlmeans/server-api'
import { paymentGate } from '../consts.js'
import { fingerprints } from '../utils.js'
import { initialize } from '../sync.js'
import type { Context } from '../types.js'

const bind = handlers<Context>()

export const resync = bind.request(paymentGate.resync, async (_request, context) => {
  await fingerprints(context).clear()
  await initialize(context)
  return { ok: true }
})
