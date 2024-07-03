import type { Context } from '@owlmeans/context'
import { createService } from '@owlmeans/context'
import { extractParams } from '@owlmeans/client-route'
import type { ApiClient } from './types.js'
import axios from 'axios'
import type { Module } from '@owlmeans/module'
import { SEP, normalizePath } from '@owlmeans/route'
import { DEFAULT_ALIAS } from './consts.js'
import { processResponse } from './utils/handler.js'
import type { Config } from '@owlmeans/client-config'

export const createApiService = (alias: string = DEFAULT_ALIAS): ApiClient => {
  const client: ApiClient = createService<ApiClient>(alias, {
    handler: async (request, reply, ctx) => {
      const module = ctx.module<Module>(request.alias)
      const route = module.route.route
      const params = extractParams(route.path)
      const path = params.reduce((path, param) => {
        if (request.params[param] == null) {
          throw new SyntaxError(`No value for param ${param}`)
        }
        return path.replace(`:${param}`, `${request.params[param]}`)
      }, route.path)
      if (route.host == null) {
        throw new SyntaxError(`No host provided in ${module.alias} route`)
      }
      const response = await axios.request({
        method: route.method,
        url: normalizePath(route.host)
          + (route.port != null ? `:${route.port}` : '') + SEP + normalizePath(path),
        params: request.query,
        data: request.body,
        headers: request.headers,
        validateStatus: () => true
      })

      processResponse(response, reply)

      return [reply.error ?? reply.value, reply.outcome] as any
    }
  })

  return client
}

export const appendApiClient = <C extends Context<Config>>(ctx: C, alias: string = DEFAULT_ALIAS): C => {
  const service = createApiService(alias)

  ctx.registerService(service)

  if (ctx.cfg.webService == null) {
    ctx.cfg.webService = alias
  }

  return ctx
}
