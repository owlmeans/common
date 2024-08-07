import type { ApiClient } from '@owlmeans/api'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { AbstractRequest, ModuleHandler } from '@owlmeans/module'
import { ModuleOutcome, provideResponse } from '@owlmeans/module'
import type { ClientModule, ModuleCall, ClientModuleOptions, ModuleRef } from '../types.js'
import { validate } from './module.js'
import { extractParams } from '@owlmeans/client-route'
import { PARAM } from '@owlmeans/route'
import { stringify } from 'qs'
import { assertContext } from '@owlmeans/context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const apiHandler: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>) => ModuleHandler = (ref) => async (req, res) => {
  const location = `client-module:api-handler:${ref.ref?.alias}`
  const context = assertContext<Config, Context>(ref.ref?.ctx as Context, location)

  if (context.cfg.webService == null) {
    throw new SyntaxError('No webService provided')
  }

  const module = context.module<ClientModule>(req.alias)
  const route = await module.route.resolve<Config, Context>(context)

  let alias: string | undefined = typeof context.cfg.webService === 'string'
    ? context.cfg.webService
    : (route.service != null
      ? context.cfg.webService[route.service] ?? context.cfg.webService[DEFAULT_KEY]
      : context.cfg.webService[DEFAULT_KEY])

  if (alias == null) {
    throw new SyntaxError(`Can't cast web service alias for ${module.alias} module`)
  }

  const service: ApiClient = context.service(alias)

  req.path = module.getPath()

  return service.handler(req, res)
}

export const apiCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>, opts?: ClientModuleOptions) => ModuleCall<T, R> =
  (ref, opts) => (async (req, res) => {
    const module = ref.ref
    if (module == null) {
      throw new SyntaxError('Try to make API call before the module is created')
    }
    const ctx = module.ctx
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${module.alias} module`)
    }

    await module.route.resolve(ctx)

    if (req?.canceled) {
      return
    }

    const request: AbstractRequest = {
      alias: module.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      path: module.getPath(),
    }
    if (req?.cancel != null) {
      const cancel = req.cancel
      req.cancel = () => {
        cancel()
        request.canceled = true
      }
    }
    if (opts?.validateOnCall) {
      await validate(ref)(request)
    }
    if (res != null) {
      await apiHandler(ref)(request, res)
      return
    }
    const reply = provideResponse<unknown>()
    if (ctx == null && module.ctx == null) {
      throw new SyntaxError(`Use module ${module.alias} wihtout context`)
    }
    await apiHandler(ref)(request, reply)
    if (reply.error != null) {
      throw reply.error
    }

    return [reply.value ?? null, reply.outcome ?? ModuleOutcome.Ok]
  }) as ModuleCall<any>

export const urlCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>, opts?: ClientModuleOptions) => ModuleCall<T, R> = ref => async (req, res) => {
  const module = ref.ref
  if (module == null) {
    throw new SyntaxError('Try to make URL before the module is created')
  }
  const ctx = module.ctx
  if (ctx == null) {
    throw new SyntaxError(`No context provided in apiCall for ${module.alias} module`)
  }
  if (ctx == null) {
    throw new SyntaxError(`No context provided in urlCall for ${module.alias} module`)
  }
  await module.route.resolve(ctx)

  const params = extractParams(module.getPath())
  let path = params.reduce((path, param) => {
    return path.replace(`${PARAM}${param}`, `${req?.params?.[param as keyof typeof req.params]}`)
  }, module.getPath()) + (req?.query != null ? `?${stringify(req?.query)}` : '')

  if (module.route.route.service !== null && ctx.cfg.service !== module.route.route.service) {
    // @TODO Fix https 
    path = 'http://' + module.route.route.host + path
  }

  res?.resolve(path as any, ModuleOutcome.Ok)

  return [path as any, ModuleOutcome.Ok]
}
