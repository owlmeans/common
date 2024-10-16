import type { ServerRouteModel } from '@owlmeans/server-route'
import type { ServerModule, ModuleOptions, ModuleRef, RefedModuleHandler } from './types.js'
import { isModule, makeCommonModule } from './utils/module.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import type { CommonModule } from '@owlmeans/module'
import type { CommonRouteModel } from '@owlmeans/route'
import type { BasicContext } from '@owlmeans/context'
import { prependBase } from '@owlmeans/route/utils'

export const module = <R>(
  arg: CommonModule | ServerRouteModel<R> | CommonRouteModel, handler?: RefedModuleHandler<R>, opts?: ModuleOptions<R>
): ServerModule<R> => {
  const moduleHandle: ModuleRef<R> = { ref: undefined }

  let _module: ServerModule<R>

  if (isModule(arg)) {
    console.log('serverise module 1: ', arg.route.route.alias)
    const routeModel = route(arg.route, opts?.intermediate ?? false, opts?.routeOptions)
    _module = arg as ServerModule<R>
    _module.route = routeModel
    _module.guards = opts?.guards ?? arg.guards
    _module.filter = opts?.filter ?? arg.filter
    _module.gate = opts?.gate ?? arg.gate
  } else if (isServerRouteModel(arg)) {
    console.log('serverise module 2: ', arg.route.alias)
    _module = makeCommonModule(arg, { ...opts }) as ServerModule<R>
    _module.route = arg
  } else {
    console.log('serverise module 3: ', arg.route.alias)
    const _route = route(arg, opts?.intermediate ?? false, opts?.routeOptions)
    _module = makeCommonModule(_route, { ...opts }) as ServerModule<R>
    _module.route = _route
  }

  _module.fixer = opts?.fixer
  if (handler != null) {
    _module.handle = handler(moduleHandle)
  }

  _module.reinitializeContext = <T>(context: BasicContext<any>) => {
    const _module = module(arg, handler, opts)
    _module.ctx = context

    return _module  as T
  }

  _module.getPath = () => prependBase(_module.route.route)

  moduleHandle.ref = _module

  return _module
}
