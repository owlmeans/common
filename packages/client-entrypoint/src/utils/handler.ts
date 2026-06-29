import type { ApiClient } from '@owlmeans/api'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { AbstractRequest, EntrypointHandler } from '@owlmeans/entrypoint'
import { EntrypointOutcome, provideResponse } from '@owlmeans/entrypoint'
import type { ClientEntrypoint, EntrypointCall, ClientEntrypointOptions, EntrypointRef, ClientRequest } from '../types.js'
import { validate } from './entrypoint.js'
import { extractParams } from '@owlmeans/client-route'
import { PARAM } from '@owlmeans/route'
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
  const route = await ep.route.resolve<Config, Context>(context)

  let alias: string | undefined = typeof context.cfg.webService === 'string'
    ? context.cfg.webService
    : (route.service != null
      ? context.cfg.webService[route.service] ?? context.cfg.webService[DEFAULT_KEY]
      : context.cfg.webService[DEFAULT_KEY])

  if (alias == null) {
    throw new SyntaxError(`Can't cast web service alias for ${ep.alias} entrypoint`)
  }

  const service: ApiClient = context.service(alias)

  req.path = ep.getPath()

  return service.handler(req, res as any)
}

export const apiCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: EntrypointRef<T, R>, opts?: ClientEntrypointOptions) => EntrypointCall<T, R> =
  (ref, opts) => (async (req, res) => {
    const ep = ref.ref
    if (ep == null) {
      throw new SyntaxError('Try to make API call before the entrypoint is created')
    }
    const ctx = ep.ctx
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${ep.alias} entrypoint`)
    }
    await ep.route.resolve(ctx)

    if (req?.canceled) {
      return
    }

    const request: AbstractRequest = {
      alias: ep.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      host: req?.host,
      base: req?.base,
      path: ep.getPath(),
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
    if (res != null) {
      await apiHandler(ref)(request, res)
      return
    }
    const reply = provideResponse<unknown>()
    if (ctx == null && ep.ctx == null) {
      throw new SyntaxError(`Use entrypoint ${ep.alias} without context`)
    }
    await apiHandler(ref)(request, reply)
    if (reply.error != null) {
      throw reply.error
    }

    return [reply.value ?? null, reply.outcome ?? EntrypointOutcome.Ok]
  }) as EntrypointCall<any>

export const urlCall: <
  T, R extends ClientRequest = ClientRequest
>(ref: EntrypointRef<T, R>, opts?: ClientEntrypointOptions) => EntrypointCall<T, R> = ref => async (req, res) => {
  const ep = ref.ref
  if (ep == null) {
    throw new SyntaxError('Try to make URL before the entrypoint is created')
  }
  const ctx = ep.ctx
  if (ctx == null) {
    throw new SyntaxError(`No context provided in urlCall for ${ep.alias} entrypoint`)
  }
  await ep.route.resolve(ctx)

  const pathParams = extractParams(ep.getPath())
  let path = pathParams.reduce((p, param) => {
    return p.replace(`${PARAM}${param}`, `${req?.params?.[param as keyof typeof req.params]}`)
  }, ep.getPath()) + (req?.query != null ? `?${stringify(req?.query)}` : '')

  if (ep.route.route.service !== null && (
    ctx.cfg.service !== ep.route.route.service
    || req?.full === true)) {
    const helper = makeSecurityHelper(ctx)
    path = helper.makeUrl(
      ep.route.route, path, { host: req?.host, base: req?.base, forceUnsecure: req?.unsecure }
    )
  }

  res?.resolve(path as any, EntrypointOutcome.Ok)

  return [path as any, EntrypointOutcome.Ok]
}
