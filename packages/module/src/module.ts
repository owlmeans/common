import type { Module } from './types.js'
import { appendContextual } from '@owlmeans/context'
import type { CreateModuleSignature } from './utils/types.js'

export const module: CreateModuleSignature<Module> = (route, opts) => {
  const module: Module = appendContextual<Module>(route.route.alias, {
    _module: true, 
    
    sticky: false,
    
    route,

    getAlias: () => module.route.route.alias,
    getPath: () =>  module.route.route.path,
    getParentAlias: () => module.route.route.parent ?? null,
    hasParent: () => module.getParentAlias() != null,
    
    resolve: async <M extends Module>() => {
      if (module.ctx == null) {
        throw new SyntaxError(`Module has no context yet - ${module.getAlias()}`)
      }

      await module.route.resolve(module.ctx)

      return module as M
    },

    getParent: () => {
      const parent = module.getParentAlias()
      if (parent == null) {
        throw new SyntaxError(`Module has no parent - ${module.getAlias()}`)
      }
      if (module.ctx == null) {
        throw new SyntaxError(`Module has no context yet - ${module.getAlias()}`)
      }
      
      return module.ctx.module(parent)
    },

    setService: service => {
      if (module.route.route.resolved) {
        throw new SyntaxError(`Cannot update a resolved module - ${module.getAlias()}`)
      }
      module.route.route.service = service
    },

    ...opts
  })

  return module
}

export const parent = <T extends Module | Module[]>(module: T, aliasOrParent: string, _parent?: string): T => {
  if (Array.isArray(module)) {
    if (_parent == null) {
      throw SyntaxError('Elevating parent requires parent name to be specified')
    }
    module = module.find(module => module.route.route.alias === aliasOrParent) as T
    if (module == null) {
      throw SyntaxError(`Module not found ${aliasOrParent}`)
    }
    return parent(module, _parent)
  }
  module.route.route.parent = aliasOrParent

  return module
}
