import type { ClientRouteModel } from '@owlmeans/client-route'
import type { ClientModule, ClientModuleOptions, ModuleRef, RefedModuleHandler } from './types.js'
import type { AbstractRequest, CommonModule } from '@owlmeans/module'
import { isModule, makeBasicModule, normalizeHelperParams, validate } from './utils/module.js'
import { isClientRouteModel, route } from '@owlmeans/client-route'
import { apiCall, apiHandler, urlCall } from './utils/handler.js'
import { AppType, appendContextual } from '@owlmeans/context'
import { normalizePath } from '@owlmeans/route'
import type { CommonRouteModel } from '@owlmeans/route'
import { provideRequest } from './helper.js'

export const module = <T, R extends AbstractRequest = AbstractRequest>(
  module: CommonModule | ClientRouteModel | CommonRouteModel,
  handler?: RefedModuleHandler<T, R> | ClientModuleOptions | boolean,
  opts?: ClientModuleOptions | boolean
): ClientModule<T, R> => {
  const moduleHanlde: ModuleRef<T, R> = { ref: undefined }

  let _module: ClientModule<T, R>

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

  const _request = (request: R): R => {
    if (moduleHanlde.ref == null) {
      throw SyntaxError(`Try to request uninitialized module ${JSON.stringify(module)}`)
    }
    const _request = provideRequest(moduleHanlde.ref.getAlias(), moduleHanlde.ref.getPath()) as R

    request != null && Object.entries(request).forEach(([key, value]) => {
      _request[key as keyof R] = value
    })

    return _request
  }

  if (isModule(module)) {
    assertExplicitHandler(module.route.route.type, handler as RefedModuleHandler<T, R>)
    const rotueModel = route(module.route, opts?.routeOptions)
    _module = appendContextual<ClientModule<T, R>>(module.alias, {
      ...module, route: rotueModel,
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate,
      getPath, call, request: _request as any,
      handle: _handler?.(moduleHanlde),
      validate: validate(moduleHanlde),
    })
  } else if (isClientRouteModel(module)) {
    assertExplicitHandler(module.route.type, handler as RefedModuleHandler<T, R>)
    _module = appendContextual<ClientModule<T, R>>(module.route.alias, {
      ...makeBasicModule(module, { ...opts }),
      route: module,
      getPath, call, request: _request as any,
      handle: _handler?.(moduleHanlde),
      validate: validate(moduleHanlde),
    })
  } else {
    assertExplicitHandler(module.route.type, handler as RefedModuleHandler<T, R>)
    const _route = route(module, opts?.routeOptions)
    _module = appendContextual<ClientModule<T, R>>(_route.route.alias, {
      ...makeBasicModule(_route, { ...opts }),
      route: _route,
      getPath, call, request: _request as any,
      handle: _handler?.(moduleHanlde),
      validate: validate(moduleHanlde),
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
