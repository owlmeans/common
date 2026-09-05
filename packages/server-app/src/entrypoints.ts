import { entrypoints as apiConfig } from '@owlmeans/api-config-server'
import { entrypoints as list } from '@owlmeans/server-auth'

export const entrypoints = [...list, ...apiConfig]
