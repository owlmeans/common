import { entrypoints as apiConfigBindings } from '@owlmeans/api-config-server'
import { entrypoints as authBindings } from '@owlmeans/server-auth'

/** Framework server entrypoints every application receives. */
export const entrypoints = [...authBindings, ...apiConfigBindings]
