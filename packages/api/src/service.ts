import { assertContext, createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { extractParams } from '@owlmeans/client-route'
import type { ApiClient } from './types.js'
import axios, { AxiosHeaders } from 'axios'
import type { AxiosRequestTransformer } from 'axios'
import type { CommonModule } from '@owlmeans/module'
import { DEFAULT_ALIAS } from './consts.js'
import { processResponse } from './utils/handler.js'
import { BasicClientConfig } from '@owlmeans/client-config'
import qs from 'qs'
import { makeSecurityHelper } from '@owlmeans/config'
import { RouteMethod } from '@owlmeans/route'
import { DEF_AUTH_SRV, TOKEN_UPDATE } from '@owlmeans/auth-common'
import type { AuthService } from '@owlmeans/auth-common'

type Config = BasicClientConfig

interface Context<C extends Config = Config> extends BasicContext<C> {
}

export const createApiService = (alias: string = DEFAULT_ALIAS): ApiClient => {
  const location = `api.service:${alias}`
  const client: ApiClient = createService<ApiClient>(alias, {
    handler: async (request, reply) => {
      console.log('1')
      if (request.canceled === true) {
        console.log('-1')
        return
      }
      console.log('We are coming')
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

      // console.log('$$$ request.payload: ', request.host, request.params, route)
      const url = helper.makeUrl(route, path, { host: request.host, base: request.base })

      let transformer: AxiosRequestTransformer | undefined = undefined

      let body = request.body != null && Object.entries((request.headers ?? {})).find(
        ([ key, value ]) =>
          key.toLowerCase() === 'content-type' && value?.includes('application/x-www-form-urlencoded')
      ) ? qs.stringify(request.body) : request.body

      // @TODO Probably this hack needs to be made a little bit less dirty
      if (typeof body === 'string' && route.method === RouteMethod.POST) {
        if (Object.keys(request.headers).every(key => key.toLowerCase() !== 'content-type')) {
          request.headers['content-type'] = 'application/json'
          // It fixes the case when final rest api under application/json can't
          // properly accept canonized jsoned string value (put into quotes)
          transformer = data => data
        }
      }

      // console.log('We try to request: ', url, route.method, request.headers, body, request.query)
      // console.log('$$$$$$$$$$ We try to request: ', url, route.method, request.headers, request.body)

      const response = await axios.request({
        url, method: route.method,
        params: request.query,
        data: body,
        headers: request.headers,
        transformRequest: transformer,
        validateStatus: () => true,
      })

      // console.log('<<<<<<< $$$$$$$$$$$$$ after request we see', response.data, response.headers, response.status)

      // @TODO Move somewhere else - desirably into auth package via some middleware
      const headers = response.headers as AxiosHeaders
      if (headers.has(TOKEN_UPDATE) && context.hasService(DEF_AUTH_SRV)) {
        const auth = context.service<AuthService>(DEF_AUTH_SRV)
        await auth.update(headers.get(TOKEN_UPDATE) as string)
      }

      processResponse(response, reply)

      return [ reply.error ?? reply.value, reply.outcome ] as any
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
