
import { modules as config, API_CONFIG } from '@owlmeans/api-config'
import { elevate } from '@owlmeans/client-module'

elevate(config, API_CONFIG)

export const modules = config
