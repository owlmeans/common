import { bindings as apiConfigBindings } from '@owlmeans/api-config-server'
import { bindings as authBindings } from '@owlmeans/server-auth'

/** Framework server bindings every application receives. */
export const bindings = [...authBindings, ...apiConfigBindings]
