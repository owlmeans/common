import type { ServerRouteModel } from '@owlmeans/server-route'
import type { ServerEntrypoint, EntrypointOptions, EntrypointRef, RefedEntrypointHandler } from './types.js'
import { isEntrypoint, makeCommonEntrypoint } from './utils/entrypoint.js'
import { isServerRouteModel, route } from '@owlmeans/server-route'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { CommonRouteModel } from '@owlmeans/route'
import type { BasicContext } from '@owlmeans/context'
import { prependBase } from '@owlmeans/route/utils'

export const entrypoint = <R>(
  arg: CommonEntrypoint | ServerRouteModel<R> | CommonRouteModel, handler?: RefedEntrypointHandler<R>, opts?: EntrypointOptions<R>
): ServerEntrypoint<R> => {
  const entrypointHandle: EntrypointRef<R> = { ref: undefined }

  let _entrypoint: ServerEntrypoint<R>

  if (isEntrypoint(arg)) {
    const routeModel = route(arg.route, opts?.intermediate ?? false, opts?.routeOptions)
    _entrypoint = arg as ServerEntrypoint<R>
    _entrypoint.route = routeModel
    _entrypoint.filter = opts?.filter ?? arg.filter
    _entrypoint.guards = [...(arg.guards ?? []), ...(opts?.guards ?? [])]
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

  _entrypoint.fixer = opts?.fixer
  if (handler != null) {
    _entrypoint.handle = handler(entrypointHandle)
  }

  _entrypoint.reinitializeContext = <T>(context: BasicContext<any>) => {
    const newEntrypoint = entrypoint(arg, handler, opts)
    newEntrypoint.ctx = context

    return newEntrypoint as T
  }

  _entrypoint.getPath = () => prependBase(_entrypoint.route.route)

  entrypointHandle.ref = _entrypoint

  return _entrypoint
}
