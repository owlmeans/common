import { modules as apiConfig } from '@owlmeans/api-config-server'
import { modules as list } from '@owlmeans/server-auth'

export const modules = [...list, ...apiConfig]
