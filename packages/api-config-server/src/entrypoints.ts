
import { advertise } from '@owlmeans/api-config'
import { bind } from '@owlmeans/server-entrypoint'
import { config } from './actions/index.js'

/** The server-local binding of the shared runtime-config protocol. */
export const entrypoints = [bind(advertise, config.advertise(advertise))]
