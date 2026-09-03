import type { ApiClient } from '@owlmeans/api'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { AbstractRequest, EntrypointHandler, EntrypointTransport } from '@owlmeans/entrypoint'
import { EntrypointOutcome, provideResponse, transportAlias } from '@owlmeans/entrypoint'
import type { ClientEntrypoint, EntrypointInvoke, EntrypointUrlOptions, ClientEntrypointOptions, EntrypointRef, ClientRequest } from '../types.js'
import { validate } from './entrypoint.js'
import { extractParams } from '@owlmeans/client-route'
import { PARAM, RouteProtocols } from '@owlmeans/route'
import { stringify } from 'qs'
import { assertContext } from '@owlmeans/context'
import { makeSecurityHelper } from '@owlmeans/config'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const apiHandler: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: EntrypointRef<T, R>) => EntrypointHandler = (ref) => async (req, res) => {
  const location = `client-entrypoint:api-handler:${ref.ref?.alias}`
  const context = assertContext<Config, Context>(ref.ref?.ctx as Context, location)

  if (context.cfg.webService == null) {
    throw new SyntaxError('No webService provided')
  }

  const ep = context.entrypoint<ClientEntrypoint>(req.alias)

  // A route names the protocol it answers on, and a protocol may be carried by something other than
  // HTTP — a queue, say. Whatever is bound under this protocol takes the call, so a consumer writes
  // `ep.call(...)` and never learns which of them ran.
  const transport = transportAlias(ep.route.route.protocol)
  if (context.hasService(transport)) {
    req.path = ep.path()

    return context.service<EntrypointTransport>(transport).handle(req, res)
  }

  // Which web client carries this call is decided by the service the route answers on — the one it
  // names, or the one the context picks for its app type when it names none.
  const route = ep.service()

  const alias: string | undefined = typeof context.cfg.webService === 'string'
    ? context.cfg.webService
    : context.cfg.webService[route.service] ?? context.cfg.webService[DEFAULT_KEY]

  if (alias == null) {
    throw new SyntaxError(`Can't cast web service alias for ${ep.alias} entrypoint`)
  }

  const service: ApiClient = context.service(alias)

  req.path = ep.path()

  return service.handler(req, res as any)
}

export const apiInvoke: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: EntrypointRef<T, R>, opts?: ClientEntrypointOptions) => EntrypointInvoke<T, R> =
  (ref, opts) => (async (req) => {
    const ep = ref.ref
    if (ep == null) {
      throw new SyntaxError('Try to make API call before the entrypoint is created')
    }
    const ctx = ep.ctx
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${ep.alias} entrypoint`)
    }

    if (req?.canceled) {
      return { value: null, outcome: EntrypointOutcome.Ok }
    }

    const request: AbstractRequest = {
      alias: ep.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      host: req?.host,
      base: req?.base,
      path: ep.path(),
      timeout: req?.timeout,
      signal: req?.signal,
    }
    if (req?.cancel != null) {
      const cancel = req.cancel
      req.cancel = () => {
        cancel()
        request.canceled = true
      }
    }
    if (opts?.validateOnCall) {
      try {
        await validate(ref)(request)
      } catch (e) {
        console.error(e)
        throw e
      }
    }
    const reply = provideResponse<unknown>()
    if (ctx == null && ep.ctx == null) {
      throw new SyntaxError(`Use entrypoint ${ep.alias} without context`)
    }
    await apiHandler(ref)(request, reply)
    if (reply.error != null) {
      throw reply.error
    }

    return { value: reply.value ?? null, outcome: reply.outcome ?? EntrypointOutcome.Ok }
  }) as EntrypointInvoke<any>

export const entrypointUrl: <
  T, R extends ClientRequest = ClientRequest
>(ref: EntrypointRef<T, R>, req?: Partial<R>, opts?: EntrypointUrlOptions) => Promise<string> = async (ref, req, opts) => {
  const ep = ref.ref
  if (ep == null) {
    throw new SyntaxError('Try to make URL before the entrypoint is created')
  }
  const ctx = ep.ctx
  if (ctx == null) {
    throw new SyntaxError(`No context provided in entrypointUrl for ${ep.alias} entrypoint`)
  }

  // The base is left off here: an in-service URL is addressed relative to it, and the absolute
  // branch below has `makeUrl` prepend it.
  const epPath = ep.path()
  const pathParams = extractParams(epPath)
  let path = pathParams.reduce((p, param) => {
    return p.replace(`${PARAM}${param}`, `${req?.params?.[param as keyof typeof req.params]}`)
  }, epPath) + (req?.query != null ? `?${stringify(req?.query)}` : '')

  // A socket address is always absolute, whoever owns the route. `new WebSocket(path)` resolves a
  // relative value against the PAGE's origin, which in a split deployment is the web host and not
  // the service that answers the upgrade — so the handshake goes somewhere that never speaks it
  // and dies on a gateway timeout. Only a same-origin HTTP route benefits from staying relative.
  const socket = ep.route.route.protocol === RouteProtocols.SOCKET

  // Locality is a question about the RESOLVED service, not about what the declaration happens to
  // name: a route that names no service belongs to the asking context, and addressing it absolutely
  // would turn in-app navigation into a full page load.
  if (socket || !ep.isLocal() || opts?.absolute === true) {
    const helper = makeSecurityHelper(ctx)
    path = helper.makeUrl(
      ep.address(), path, { host: req?.host, base: req?.base, forceUnsecure: req?.unsecure }
    )
  }

  return path
}
