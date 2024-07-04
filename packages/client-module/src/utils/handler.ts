import type { ApiClient } from '@owlmeans/api'
import type { Config } from '@owlmeans/client-config'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientContext } from '@owlmeans/client-context'
import type { AbstractRequest, ModuleHandler } from '@owlmeans/module'
import { ModuleOutcome, provideResponse } from '@owlmeans/module'
import type { Module, ModuleCall, ModuleOptions } from '../types.js'
import { validate } from './module.js'
import { extractParams } from '@owlmeans/client-route'
import { PARAM } from '@owlmeans/route'
import { stringify } from 'qs'
import type { ModuleRef } from './types.js'

export const apiHandler: ModuleHandler = async (req, res, ctx) => {
  const _ctx: ClientContext<Config> = ctx as unknown as ClientContext<Config>

  if (_ctx.cfg.webService == null) {
    throw new SyntaxError('No webService provided')
  }

  const module = _ctx.module<Module<any, any>>(req.alias)
  const route = await module.route.resolve(_ctx)

  let alias: string | undefined = typeof _ctx.cfg.webService === 'string'
    ? _ctx.cfg.webService
    : (route.service != null
      ? _ctx.cfg.webService[route.service] ?? _ctx.cfg.webService[DEFAULT_KEY]
      : _ctx.cfg.webService[DEFAULT_KEY])

  if (alias == null) {
    throw new SyntaxError(`Can't cast web service alias for ${module.alias} module`)
  }

  const service: ApiClient = _ctx.service(alias)

  req.path = route.path

  return service.handler(req, res, ctx)
}

export const apiCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>, opts?: ModuleOptions) => ModuleCall<T, R> =
  (ref, opts) => (async (ctx, req, res) => {
    const module = ref.ref
    if (module == null) {
      throw new SyntaxError('Try to make API call before the module is created')
    }
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${module.alias} module`)
    }
    await module.route.resolve(ctx)
    const request: AbstractRequest = {
      alias: module.alias,
      params: req?.params ?? {},
      body: req?.body,
      headers: req?.headers ?? {},
      query: req?.query ?? {},
      path: module.route.route.path,
    }
    if (opts?.validateOnCall) {
      await validate(ctx, request)
    }
    if (res != null) {
      await apiHandler(request, res, ctx)
      return
    }
    const reply = provideResponse<unknown>()
    if (ctx == null && module.ctx == null) {
      throw new SyntaxError(`Use module ${module.alias} wihtout context`)
    }
    await apiHandler(request, reply, ctx ?? module.ctx!)
    if (reply.error != null) {
      throw reply.error
    }

    return [reply.value ?? null, reply.outcome ?? ModuleOutcome.Ok]
  }) as ModuleCall<any>

export const urlCall: <
  T, R extends AbstractRequest = AbstractRequest
>(ref: ModuleRef<T, R>, opts?: ModuleOptions) => ModuleCall<T, R> =
  (ref) => async (ctx, req) => {
    const module = ref.ref
    if (module == null) {
      throw new SyntaxError('Try to make API call before the module is created')
    }
    if (ctx == null) {
      throw new SyntaxError(`No context provided in apiCall for ${module.alias} module`)
    }
    await module.route.resolve(ctx)
    const params = extractParams(module.getPath())
    const path = params.reduce((path, param) => {
      return path.replace(`${PARAM}${param}`, `${req?.params?.[param]}`)
    }, module.getPath()) + req?.query != null ? `?${stringify(req?.query)}` : ''

    return [path as any, ModuleOutcome.Ok]
  }
