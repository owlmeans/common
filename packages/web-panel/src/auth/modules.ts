
import { modules as list } from '@owlmeans/client-auth/manager/modules'
import { modules as config } from '@owlmeans/api-config-client'

export const modules = [...list, ...config]
