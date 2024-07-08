import type { ServerRouteModel } from '@owlmeans/server-route'
import type { ServerModule, ModuleOptions, ModuleRef, RefedModuleHandler } from './types.js'
import { isModule, makeCommonModule } from './utils/module.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import { appendContextual } from '@owlmeans/context'
import type { CommonModule } from '@owlmeans/module'
import type { CommonRouteModel } from '@owlmeans/route'

export const module = <R>(
  module: CommonModule | ServerRouteModel<R> | CommonRouteModel, handler?: RefedModuleHandler<R>, opts?: ModuleOptions<R>
): ServerModule<R> => {
  const moduleHandle: ModuleRef<R> = { ref: undefined }

  if (isModule(module)) {
    const rotueModel = route(module.route, opts?.intermediate ?? false, opts?.routeOptions)
    const _module: ServerModule<R> = appendContextual(module.alias, {
      ...module, route: rotueModel, handle: handler?.(moduleHandle),
      fixer: opts?.fixer,
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate,
    })

    moduleHandle.ref = _module

    return _module
  } else if (isServerRouteModel(module)) {
    const _module: ServerModule<R> = appendContextual(module.route.alias, {
      ...makeCommonModule(module, { ...opts }),
      route: module, handle: handler?.(moduleHandle), fixer: opts?.fixer
    })

    moduleHandle.ref = _module

    return _module
  }
  const _route = route(module, opts?.intermediate ?? false, opts?.routeOptions)
  const _module: ServerModule<R> = appendContextual(module.route.alias, {
    ...makeCommonModule(_route, { ...opts }),
    route: _route, handle: handler?.(moduleHandle), fixer: opts?.fixer
  })

  moduleHandle.ref = _module

  return _module
}
