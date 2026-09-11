
import { bindings as authBindings } from '@owlmeans/client-auth/manager/entrypoints'
import { bindings as configBindings } from '@owlmeans/api-config-client'

export const bindings = [...authBindings, ...configBindings]
