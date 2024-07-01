import type { Module } from './types.js'
import { appendContextual } from '@owlmeans/context'
import type { CreateModuleSignature } from './utils/types.js'

export const module: CreateModuleSignature<Module> = (route, opts) => {
  const module = appendContextual<Module>(route.route.alias, {
    ...opts,
    route
  })

  return module
}
