
import { entrypoints as config, API_CONFIG } from '@owlmeans/api-config'
import { elevate } from '@owlmeans/client-entrypoint'

elevate(config, API_CONFIG)

export const entrypoints = config
