
import { entrypoints as authBindings } from '@owlmeans/client-auth/manager/entrypoints'
import { entrypoints as configBindings } from '@owlmeans/api-config-client'

export const entrypoints = [...authBindings, ...configBindings]
