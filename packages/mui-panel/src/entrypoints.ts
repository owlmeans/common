
import { entrypoints as webClientBindings } from '@owlmeans/web-client'
import { entrypoints as configBindings } from '@owlmeans/api-config-client'

export const entrypoints = [...webClientBindings, ...configBindings]
