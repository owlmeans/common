import type { RouteModel } from '@owlmeans/client-route'
import type { Module, ModuleCall, ModuleOptions } from './types.js'
import type { BasicModule, BasicRouteModel } from './utils/types.js'
import type { AbstractRequest } from '@owlmeans/module'
import { ModuleOutcome, provideResponse } from '@owlmeans/module'
import { isModule, makeBasicModule } from './utils/module.js'
import { isClientRouteModel, route } from '@owlmeans/client-route'
import { handler } from './utils/handler.js'

export const module = <T, R extends AbstractRequest = AbstractRequest>(
  module: BasicModule | RouteModel | BasicRouteModel,
  opts?: ModuleOptions
): Module<T, R> => {

  let _module: Module<T, R>

  const call: ModuleCall<T, R> = async (ctx, req, res) => {
    const request: AbstractRequest = {
      alias: _module.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      path: _module.route.route.path,
    }
    if (res != null) {
      await handler(request, res, ctx!)
      return
    }
    const reply = provideResponse<T>()
    if (ctx == null && _module.ctx == null) {
      throw new SyntaxError(`Use module ${_module.alias} wihtout context`)
    }
    await handler(request, reply, ctx ?? _module.ctx!)
    if (reply.error != null) {
      throw reply.error
    }

    return [reply.value ?? null, reply.outcome ?? ModuleOutcome.Ok]
  }

  if (isModule(module)) {
    const rotueModel = route(module.route, opts?.routeOptions)
    _module = {
      ...module, route: rotueModel, handler, call,
      guards: opts?.guards ?? module.guards,
      filter: opts?.filter ?? module.filter,
      gate: opts?.gate ?? module.gate,
    }

  } else if (isClientRouteModel(module)) {
    _module = {
      ...makeBasicModule(module, { ...opts }),
      route: module, handler, call
    }
  } else {
    const _route = route(module, opts?.routeOptions)
    _module = {
      ...makeBasicModule(_route, { ...opts }),
      route: _route, handler, call
    }
  }

  return _module
}
