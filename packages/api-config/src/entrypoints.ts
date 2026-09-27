import { openProtocol } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { API_CONFIG } from './consts.js'

/** The public runtime-config endpoint protocol. */
export const advertise = openProtocol(route(API_CONFIG, '/assets/config.json'), { sticky: true })
