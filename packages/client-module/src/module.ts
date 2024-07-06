import type { RouteModel } from '@owlmeans/client-route'
import type { Module, ModuleOptions, ModuleRef, RefedModuleHandler } from './types.js'
import type { BasicModule, BasicRouteModel } from './utils/types.js'
import type { AbstractRequest } from '@owlmeans/module'
import { isModule, makeBasicModule, normalizeHelperParams, validate } from './utils/module.js'
import { isClientRouteModel, route } from '@owlmeans/client-route'
import { apiCall, apiHandler, urlCall } from './utils/handler.js'
import { AppType, appendContextual } from '@owlmeans/context'
import { normalizePath } from '@owlmeans/route'

export const module = <T, R extends AbstractRequest = AbstractRequest>(
  module: BasicModule | RouteModel | BasicRouteModel,
  handler?: RefedModuleHandler<T, R> | ModuleOptions | boolean,
  opts?: ModuleOptions | boolean
): Module<T, R> => {
  const moduleHanlde: ModuleRef<T, R> = { ref: undefined }

  let _module: Module<T, R>

  [handler, opts] = normalizeHelperParams(handler, opts)

  const _handler = handler as RefedModuleHandler<T, R> | undefined ??
    // There are server modules (api) and client modules. 
    // Last ones do not need to stab handler with api call.
    (('route' in module.route ? module.route.route.type : module.route.type)
      === AppType.Backend ? apiHandler : undefined)

  const getPath = (partial?: boolean) =>
    partial === true ? normalizePath(_module.route.route.partialPath) : _module.route.route.path

  // @TODO. Right now - we expect that if we provided a handler, than this is a frontend module, 
  // so we get routes for navigation instead of calling APIs.
  const call = handler != null ? urlCall<T, R>(moduleHanlde, opts) : apiCall<T, R>(moduleHanlde, opts)

  if (isModule(module)) {
    assertExplicitHandler(module.route.route.type, handler as RefedModuleHandler<T, R>)
    const rotueModel = route(module.route, opts?.routeOptions)
    _module = appendContextual<Module<T, R>>(module.alias, {
      ...module, route: rotueModel, handle: _handler?.(moduleHanlde), call, validate: validate(moduleHanlde),
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate, getPath
    })
  } else if (isClientRouteModel(module)) {
    assertExplicitHandler(module.route.type, handler as RefedModuleHandler<T, R>)
    _module = appendContextual<Module<T, R>>(module.route.alias, {
      ...makeBasicModule(module, { ...opts }),
      route: module, handle: _handler?.(moduleHanlde), call, validate: validate(moduleHanlde), getPath
    })
  } else {
    assertExplicitHandler(module.route.type, handler as RefedModuleHandler<T, R>)
    const _route = route(module, opts?.routeOptions)
    _module = appendContextual<Module<T, R>>(_route.route.alias, {
      ...makeBasicModule(_route, { ...opts }),
      route: _route, handle: _handler?.(moduleHanlde), call, validate: validate(moduleHanlde), getPath
    })
  }

  moduleHanlde.ref = _module

  return _module
}

const assertExplicitHandler = <T, R extends AbstractRequest = AbstractRequest>(
  type: AppType, handler: RefedModuleHandler<T, R> | undefined
) => {
  if (type === AppType.Backend && handler != null) {
    throw new SyntaxError('We can\'t provide explicit handler to backend client module')
  }
}
