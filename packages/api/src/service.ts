import { assertContext, createService } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { extractParams } from '@owlmeans/client-route'
import type { ApiClient } from './types.js'
import axios, { AxiosHeaders } from 'axios'
import type { AxiosRequestTransformer } from 'axios'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { DEFAULT_ALIAS, UNAUTHORIZED_ERROR } from './consts.js'
import { processResponse } from './utils/handler.js'
import { BasicClientConfig } from '@owlmeans/client-config'
import qs from 'qs'
import { makeSecurityHelper } from '@owlmeans/config'
import { RouteMethod } from '@owlmeans/route'
import { AUTH_HEADER, DEF_AUTH_SRV, TOKEN_UPDATE } from '@owlmeans/auth-common'
import type { AuthService } from '@owlmeans/auth-common'

/** Whether a request carried an authentication header of its own. */
const presented = (headers?: Record<string, unknown>): boolean =>
  headers != null && Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === AUTH_HEADER && value != null && value !== ''
  )

type Config = BasicClientConfig

interface Context<C extends Config = Config> extends BasicContext<C> {
}

export const createApiService = (alias: string = DEFAULT_ALIAS): ApiClient => {
  const location = `api.service:${alias}`
  const client: ApiClient = createService<ApiClient>(alias, {
    handler: async (request, reply) => {
      if (request.canceled === true) {
        return
      }
      const context = assertContext<Config, Context>(client.ctx, location)
      const module = context.entrypoint<CommonEntrypoint>(request.alias)
      const route = module.route.route
      let path = module.path()
      const params = extractParams(path)
      path = params.reduce((path, param) => {
        type Key = keyof typeof request.params
        if (request.params[param as Key] == null) {
          throw new SyntaxError(`No value for param ${param}`)
        }
        return path.replace(`:${param}`, `${request.params[param as Key]}`)
      }, path)

      const helper = makeSecurityHelper(context)

      // The entrypoint answers where it lives — host, port, base, protocol and whether the hop is
      // TLS — from its declaration and the service it names. A per-request host still overrides it.
      const url = helper.makeUrl(
        module.address(), path,
        { host: request.host, base: request.base, forceUnsecure: request.unsecure }
      )

      let transformer: AxiosRequestTransformer | undefined = undefined

      let body = request.body != null && Object.entries((request.headers ?? {})).find(
        ([key, value]) =>
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

      const response = await axios.request({
        url, method: route.method,
        params: request.query,
        data: body,
        headers: request.headers,
        transformRequest: transformer,
        validateStatus: () => true,
        // Per-request timeout (ms); axios aborts the request and rejects on expiry.
        // Omitted/0 = no timeout (axios default), preserving existing callers.
        timeout: request.timeout,
        // Abort signal (e.g. a caller's timeout AbortController) — aborts in-flight.
        signal: request.signal,
      })

      // @TODO Move somewhere else - desirably into auth package via some middleware
      const headers = response.headers as AxiosHeaders
      if (headers.has(TOKEN_UPDATE) && context.hasService(DEF_AUTH_SRV)) {
        const auth = context.service<AuthService>(DEF_AUTH_SRV)
        const update = headers.get(TOKEN_UPDATE) as string
        await auth.update(update == null || update === '' ? undefined : update)
      } else if (
        response.status === UNAUTHORIZED_ERROR
        && presented(request.headers)
        && context.hasService(DEF_AUTH_SRV)
      ) {
        /**
         * A session the server has refused is not a session, and keeping it is worse than having
         * none: the application goes on rendering its signed-in tree over a credential that fails
         * every call it makes, and nothing on the client ever asks again — `authenticated()` reads
         * storage and decodes an envelope, it does not consult the server. What that leaves is an
         * app that looks signed in, works at nothing, and offers "Log out" where the control that
         * would fix it should be.
         *
         * Narrow on purpose. Only a request that actually PRESENTED this context's bearer counts,
         * so a 401 from an authentication attempt — bad code, wrong password, an expired challenge
         * — never clears the session of whoever is already signed in.
         */
        await context.service<AuthService>(DEF_AUTH_SRV).update(undefined)
      }

      processResponse(response, reply)

      return [reply.error ?? reply.value, reply.outcome] as any
    }
  }, service => async () => {
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
