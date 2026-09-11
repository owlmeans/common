
import { bindings as webClientBindings } from '@owlmeans/web-client'
import { bindings as configBindings } from '@owlmeans/api-config-client'

export const bindings = [...webClientBindings, ...configBindings]
