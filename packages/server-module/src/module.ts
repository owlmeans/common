import type { RouteModel } from '@owlmeans/server-route'
import type { Module, ModuleOptions, ModuleRef, RefedModuleHandler } from './types.js'
import type { BasicModule, BasicRouteModel } from './utils/types.js'
import { isModule, makeBasicModule } from './utils/module.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import { appendContextual } from '@owlmeans/context'

export const module = <R>(
  module: BasicModule | RouteModel<R> | BasicRouteModel, handler?: RefedModuleHandler<R>, opts?: ModuleOptions<R>
): Module<R> => {
  const moduleHandle: ModuleRef<R> = { ref: undefined }

  if (isModule(module)) {
    const rotueModel = route(module.route, opts?.intermediate ?? false, opts?.routeOptions)
    const _module: Module<R> = appendContextual(module.alias, {
      ...module, route: rotueModel, handle: handler?.(moduleHandle),
      fixer: opts?.fixer,
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate,
    })

    moduleHandle.ref = _module

    return _module
  } else if (isServerRouteModel(module)) {
    const _module: Module<R> = appendContextual(module.route.alias, {
      ...makeBasicModule(module, { ...opts }),
      route: module, handle: handler?.(moduleHandle), fixer: opts?.fixer
    })

    moduleHandle.ref = _module

    return _module
  }
  const _route = route(module, opts?.intermediate ?? false, opts?.routeOptions)
  const _module: Module<R> = appendContextual(module.route.alias, {
    ...makeBasicModule(_route, { ...opts }),
    route: _route, handle: handler?.(moduleHandle), fixer: opts?.fixer
  })

  moduleHandle.ref = _module

  return _module
}
