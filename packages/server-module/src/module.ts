import type { RouteModel } from '@owlmeans/server-route'
import type { Module, ModuleOptions } from './types.js'
import type { BasicModule, BasicRouteModel } from './utils/types.js'
import type { ModuleHandler } from '@owlmeans/module'
import { isModule, makeBasicModule } from './utils/module.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import { appendContextual } from '@owlmeans/context'

export const module = <R>(
  module: BasicModule | RouteModel<R> | BasicRouteModel, handler: ModuleHandler, opts?: ModuleOptions<R>
): Module<R> => {
  if (isModule(module)) {
    const rotueModel = route(module.route, opts?.intermediate ?? false, opts?.routeOptions)
    const _module: Module<R> = appendContextual(module.alias, {
      ...module, route: rotueModel, handler, 
      fixer: opts?.fixer,
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate,
    })

    return _module
  } else if (isServerRouteModel(module)) {
    const _module: Module<R> = appendContextual(module.route.alias, {
      ...makeBasicModule(module, { ...opts }),
      route: module, handler, fixer: opts?.fixer
    })

    return _module
  }
  const _route = route(module, opts?.intermediate ?? false, opts?.routeOptions)
  const _module: Module<R> = appendContextual(module.route.alias, {
    ...makeBasicModule(_route, { ...opts }),
    route: _route, handler, fixer: opts?.fixer
  })

  return _module
}
