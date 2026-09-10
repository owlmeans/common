import type { ServerRouteModel } from '@owlmeans/server-route'
import type { ServerEntrypoint, EntrypointOptions, EntrypointRef, RefedEntrypointHandler } from './types.js'
import { isEntrypoint, makeCommonEntrypoint } from './utils/entrypoint.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { RouteModel } from '@owlmeans/route'

export const entrypoint = <R>(
  arg: CommonEntrypoint | ServerRouteModel<R> | RouteModel, handler?: RefedEntrypointHandler<R>, opts?: EntrypointOptions<R>
): ServerEntrypoint<R> => {
  const entrypointHandle: EntrypointRef<R> = { ref: undefined }

  let _entrypoint: ServerEntrypoint<R>

  if (isEntrypoint(arg)) {
    // Elevating the same alias again is legal, so an intermediate route stays intermediate unless
    // this call says otherwise.
    const intermediate = opts?.intermediate
      ?? (isServerRouteModel(arg.route) ? arg.route.isIntermediate() : false)
    const routeModel = route(arg.route, intermediate, opts?.routeOptions)
    _entrypoint = arg as ServerEntrypoint<R>
    _entrypoint.route = routeModel
    _entrypoint.filter = opts?.filter ?? arg.filter
    // Elevating adds guards, it never swaps them: what the entrypoint declared still applies.
    _entrypoint.guards = [...new Set([...(arg.guards ?? []), ...(opts?.guards ?? [])])]
    _entrypoint.gate = opts?.gate ?? arg.gate
    _entrypoint.gateParams = opts?.gateParams ?? arg.gateParams
  } else if (isServerRouteModel(arg)) {
    _entrypoint = makeCommonEntrypoint(arg, { ...opts }) as ServerEntrypoint<R>
    _entrypoint.route = arg
  } else {
    const _route = route(arg, opts?.intermediate ?? false, opts?.routeOptions)
    _entrypoint = makeCommonEntrypoint(_route, { ...opts }) as ServerEntrypoint<R>
    _entrypoint.route = _route
  }

  _entrypoint.fixer = opts?.fixer ?? _entrypoint.fixer
  if (handler != null) {
    _entrypoint.handle = handler(entrypointHandle)
  }

  entrypointHandle.ref = _entrypoint

  return _entrypoint
}
