
import { entrypoints as list } from '@owlmeans/client-auth/manager/entrypoints'
import { entrypoints as config } from '@owlmeans/api-config-client'

export const entrypoints = [...list, ...config]
