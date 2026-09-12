import { bind } from '@owlmeans/server-entrypoint'
import { paymentGate } from './consts.js'
import { resync, webhook } from './actions/index.js'

/** Runtime-local bindings for the shared immutable payment-gateway protocol tree. */
export const paymentGateEntrypoints = [
  bind(paymentGate.base),
  bind(paymentGate.webhook, webhook),
  bind(paymentGate.resync, resync),
]
