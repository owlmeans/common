import type { ApiClient } from '@owlmeans/api'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { AbstractRequest, ModuleHandler } from '@owlmeans/module'
import { ModuleOutcome, provideResponse } from '@owlmeans/module'
import type { ClientModule, ModuleCall, ClientModuleOptions, ModuleRef, ClientRequest } from '../types.js'
import { validate } from './module.js'
import { extractParams } from '@owlmeans/client-route'
import { PARAM } from '@owlmeans/route'
import { stringify } from 'qs'
import { assertContext } from '@owlmeans/context'
import { makeSecurityHelper } from '@owlmeans/config'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const apiHandler: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>) => ModuleHandler = (ref) => async (req, res) => {
  console.log('api handler', req.alias)
  const location = `client-module:api-handler:${ref.ref?.alias}`
  const context = assertContext<Config, Context>(ref.ref?.ctx as Context, location)

  if (context.cfg.webService == null) {
    throw new SyntaxError('No webService provided')
  }

  const module = context.module<ClientModule>(req.alias)
  console.log('before resolve')
  const route = await module.route.resolve<Config, Context>(context)
  console.log('after resolve')

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

  console.log('handle with service', service.alias)

  return service.handler(req, res)
}

export const apiCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>, opts?: ClientModuleOptions) => ModuleCall<T, R> =
  (ref, opts) => (async (req, res) => {
    const module = ref.ref
    console.log('api call', module?.alias)
    if (module == null) {
      throw new SyntaxError('Try to make API call before the module is created')
    }
    const ctx = module.ctx
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${module.alias} module`)
    }

    console.log('before resolve')
    await module.route.resolve(ctx)
    console.log('after resolve')

    if (req?.canceled) {
      console.log('canceled api call')
      return
    }

    const request: AbstractRequest = {
      alias: module.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      host: req?.host,
      base: req?.base,
      path: module.getPath(),
    }
    if (req?.cancel != null) {
      const cancel = req.cancel
      req.cancel = () => {
        cancel()
        request.canceled = true
      }
    }
    console.log('berofer validate')
    if (opts?.validateOnCall) {
      console.log('validate on call')
      try {
        await validate(ref)(request)
      } catch (e) {
        console.log(module.filter)
        console.log(request?.body)
        console.log(request?.params)
        console.log(request?.query)
        console.error(e)
        throw e
      }
    }
    console.log('berofer apihandling')
    if (res != null) {
      console.log('start handling 1')
      await apiHandler(ref)(request, res)
      return
    }
    const reply = provideResponse<unknown>()
    if (ctx == null && module.ctx == null) {
      throw new SyntaxError(`Use module ${module.alias} wihtout context`)
    }
    console.log('start handling 2')
    await apiHandler(ref)(request, reply)
    if (reply.error != null) {
      throw reply.error
    }

    return [reply.value ?? null, reply.outcome ?? ModuleOutcome.Ok]
  }) as ModuleCall<any>

export const urlCall: <
  T, R extends ClientRequest = ClientRequest
>(ref: ModuleRef<T, R>, opts?: ClientModuleOptions) => ModuleCall<T, R> = ref => async (req, res) => {
  const module = ref.ref
  console.log('url call', module?.alias)
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

  if (module.route.route.service !== null && (
    ctx.cfg.service !== module.route.route.service
    || req?.full === true)) {
    const helper = makeSecurityHelper(ctx)
    path = helper.makeUrl(module.route.route, path)
  }

  res?.resolve(path as any, ModuleOutcome.Ok)

  return [path as any, ModuleOutcome.Ok]
}
