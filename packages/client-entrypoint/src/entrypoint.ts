import type { ClientRouteModel } from '@owlmeans/client-route'
import type { ClientEntrypoint, ClientEntrypointOptions, EntrypointRef, RefedEntrypointHandler } from './types.js'
import type { AbstractRequest, CommonEntrypoint } from '@owlmeans/entrypoint'
import { isEntrypoint, makeBasicEntrypoint, normalizeHelperParams, validate } from './utils/entrypoint.js'
import { isClientRouteModel, route } from '@owlmeans/client-route'
import { apiInvoke, apiHandler, entrypointUrl } from './utils/handler.js'
import { AppType } from '@owlmeans/context'
import type { RouteModel } from '@owlmeans/route'
import { provideRequest } from './helper.js'

export const entrypoint = <T, R extends AbstractRequest = AbstractRequest>(
  arg: CommonEntrypoint | ClientRouteModel | RouteModel,
  handler?: RefedEntrypointHandler<T, R> | ClientEntrypointOptions | boolean,
  opts?: ClientEntrypointOptions | boolean
): ClientEntrypoint<T, R> => {
  const entrypointHandle: EntrypointRef<T, R> = { ref: undefined }

  let _entrypoint: ClientEntrypoint<T, R>

  ;[handler, opts] = normalizeHelperParams(handler, opts)

  const _handler = handler as RefedEntrypointHandler<T, R> | undefined ??
    (('route' in arg.route ? arg.route.route.type : arg.route.type)
      === AppType.Backend ? apiHandler : undefined)

  if (isEntrypoint(arg)) {
    assertExplicitHandler(arg.route.route.type, handler as RefedEntrypointHandler<T, R>)
    const routeModel = route(arg.route, opts?.routeOptions)
    _entrypoint = arg as ClientEntrypoint<T, R>
    _entrypoint.route = routeModel
    // Elevating adds guards, it never swaps them: what the entrypoint declared still applies.
    _entrypoint.guards = [...new Set([...(arg.guards ?? []), ...(opts?.guards ?? [])])]
    _entrypoint.filter = opts?.filter ?? arg.filter
    _entrypoint.gate = opts?.gate ?? arg.gate
    _entrypoint.gateParams = opts?.gateParams ?? arg.gateParams
  } else if (isClientRouteModel(arg)) {
    assertExplicitHandler(arg.route.type, handler as RefedEntrypointHandler<T, R>)
    _entrypoint = makeBasicEntrypoint(arg, { ...opts }) as ClientEntrypoint<T, R>
    _entrypoint.route = arg
  } else {
    assertExplicitHandler(arg.route.type, handler as RefedEntrypointHandler<T, R>)
    const _route = route(arg, opts?.routeOptions)
    _entrypoint = makeBasicEntrypoint(_route, { ...opts }) as ClientEntrypoint<T, R>
    _entrypoint.route = _route
  }

  _entrypoint.url = ((req?: Partial<R>, urlOpts?: { absolute?: boolean }) =>
    entrypointUrl<T, R>(entrypointHandle, req as never, urlOpts)) as ClientEntrypoint<T, R>['url']

  // An entrypoint carrying a renderer IS a screen: it is addressed by URL, never called over the
  // wire. Saying so here turns what used to be a URL-shaped answer from `call()` into a report.
  _entrypoint.invoke = (handler != null
    ? (async () => {
      throw new SyntaxError(
        `Entrypoint ${_entrypoint.alias} renders a screen - address it with url() instead of call()/invoke()`
      )
    })
    : apiInvoke<T, R>(entrypointHandle, opts)) as ClientEntrypoint<T, R>['invoke']

  _entrypoint.call = (async (req?: Partial<R>) =>
    (await _entrypoint.invoke(req)).value) as ClientEntrypoint<T, R>['call']

  _entrypoint.request = ((request: R): R => {
    if (entrypointHandle.ref == null) {
      throw SyntaxError(`Try to request uninitialized entrypoint ${JSON.stringify(arg)}`)
    }
    const _request = provideRequest(entrypointHandle.ref.alias, entrypointHandle.ref.path()) as R

    request != null && Object.entries(request).forEach(([key, value]) => {
      _request[key as keyof R] = value
    })

    return _request
  }) as any

  _entrypoint.handle = _handler?.(entrypointHandle)

  _entrypoint.validate = validate(entrypointHandle)

  entrypointHandle.ref = _entrypoint

  return _entrypoint
}

const assertExplicitHandler = <T, R extends AbstractRequest = AbstractRequest>(
  type: AppType, handler: RefedEntrypointHandler<T, R> | undefined
) => {
  if (type === AppType.Backend && handler != null) {
    throw new SyntaxError('We can\'t provide explicit handler to backend client entrypoint')
  }
}
