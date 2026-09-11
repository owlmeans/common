import { elevate } from '@owlmeans/server-entrypoint'
import { paymentGateProtocols } from './consts.js'
import { resync, webhook } from './actions/index.js'

export const paymentGateEntrypoints = elevate(paymentGateProtocols, [webhook, resync])
