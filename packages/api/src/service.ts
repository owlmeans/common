import { assertContext, createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { extractParams } from '@owlmeans/client-route'
import type { ApiClient } from './types.js'
import axios from 'axios'
import type { AxiosRequestTransformer } from 'axios'
import type { CommonModule } from '@owlmeans/module'
import { DEFAULT_ALIAS } from './consts.js'
import { processResponse } from './utils/handler.js'
import { BasicClientConfig } from '@owlmeans/client-config'
import qs from 'qs'
import { makeSecurityHelper } from '@owlmeans/config'
import { RouteMethod } from '@owlmeans/route'

type Config = BasicClientConfig
interface Context<C extends Config = Config> extends BasicContext<C> { }

export const createApiService = (alias: string = DEFAULT_ALIAS): ApiClient => {
  const location = `api.service:${alias}`
  const client: ApiClient = createService<ApiClient>(alias, {
    handler: async (request, reply) => {
      if (request.canceled === true) {
        return
      }
      const context = assertContext<Config, Context>(client.ctx, location)
      const module = context.module<CommonModule>(request.alias)
      await module.resolve()
      const route = module.route.route
      let path = module.getPath()
      const params = extractParams(path)
      path = params.reduce((path, param) => {
        type Key = keyof typeof request.params
        if (request.params[param as Key] == null) {
          throw new SyntaxError(`No value for param ${param}`)
        }
        return path.replace(`:${param}`, `${request.params[param as Key]}`)
      }, path)
      if (route.host == null && request.host == null) {
        throw new SyntaxError(`No host provided in ${module.alias} route`)
      }

      const helper = makeSecurityHelper(context)

      const url = helper.makeUrl(route, path, { host: request.host })

      let transformer: AxiosRequestTransformer | undefined = undefined

      let body = request.body != null && Object.entries((request.headers ?? {})).find(
        ([key, value]) =>
          key.toLowerCase() === 'content-type' && value?.includes('application/x-www-form-urlencoded')
      ) ? qs.stringify(request.body) : request.body

      // @TODO Probably this hack need to be made a little bit less dirty
      if (typeof body === 'string' && route.method === RouteMethod.POST) {
        if (Object.keys(request.headers).every(key => key.toLowerCase() !== 'content-type')) {
          request.headers['content-type'] = 'application/json'
          // It fixes the case when final rest api under application/json can't
          // properly accept canonized jsoned string value (put into quotes)
          transformer = data => data
        }
      }

      // console.log('We try to request: ', url, route.method, request.headers, body, request.query)

      const response = await axios.request({
        url, method: route.method,
        params: request.query,
        data: body,
        headers: request.headers,
        transformRequest: transformer,
        validateStatus: () => true,
      })

      // console.log('after request we see', response.data, response.headers, response.status)

      processResponse(response, reply)

      return [reply.error ?? reply.value, reply.outcome] as any
    }
  }, service => async () => {
    console.log(`service:${alias}: API client service is initialized`)
    service.initialized = true
  })

  return client
}

export const appendApiClient = <C extends Config, T extends Context<C>>(ctx: T, alias: string = DEFAULT_ALIAS): T => {
  const service = createApiService(alias)

  ctx.registerService(service)

  if (ctx.cfg.webService == null) {
    ctx.cfg.webService = alias
  }

  return ctx
}
