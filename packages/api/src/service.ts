import { assertContext, createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { extractParams } from '@owlmeans/client-route'
import type { ApiClient } from './types.js'
import axios from 'axios'
import type { CommonModule } from '@owlmeans/module'
import { DEFAULT_ALIAS } from './consts.js'
import { processResponse } from './utils/handler.js'
import { BasicClientConfig } from '@owlmeans/client-config'
import qs from 'qs'
import { makeSecurityHelper } from '@owlmeans/config'

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
      if (route.host == null) {
        throw new SyntaxError(`No host provided in ${module.alias} route`)
      }

      const helper = makeSecurityHelper(context)

      const url = helper.makeUrl(route, path)

      // let url = normalizePath(route.host)
      //   + (route.port != null ? `:${route.port}` : '') + SEP + normalizePath(path)

      // const [prefix] = url.split('://')
      // if (!protocols.includes(prefix)) {
      //   // @TODO fix security
      //   if (route.protocol !== RouteProtocols.SOCKET) {
      //     url = `http://${url}`
      //   } else {
      //     url = `ws://${url}`
      //   }
      // }

      const body = request.body != null && Object.entries((request.headers ?? {})).find(
        ([key, value]) =>
          key.toLowerCase() === 'content-type' && value?.includes('application/x-www-form-urlencoded')
      ) ? qs.stringify(request.body) : request.body

      // console.log('We try to request: ', url, request.headers)

      const response = await axios.request({
        url, method: route.method,
        params: request.query,
        data: body,
        headers: request.headers,
        validateStatus: () => true
      })

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
