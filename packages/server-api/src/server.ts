import type { Context } from '@owlmeans/server-context'
import type { ApiServer, ApiServerAppend } from './types.js'
import { Layer, createService } from '@owlmeans/context'
import type { UpdContextType } from '@owlmeans/context'
import { basicAssertContext, canServeModule, executeResponse, provideRequest } from './utils/index.js'
import { DEFAULT_ALIAS, HOST, PORT } from './consts.js'
import type { Module } from '@owlmeans/server-module'
import { RouteMethod } from '@owlmeans/route'
import { createServerHandler } from './utils/context.js'
import { provideResponse } from '@owlmeans/module'

import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'

export const createApiServer = (alias: string): ApiServer => {
  const location = `service:${alias}`
  const assertContext = (context: Context | undefined): Context => basicAssertContext(context, location)

  const server = createService<ApiServer>(alias, {
    layers: [Layer.System]
  }, service => async () => {
    console.log(`${location}: ready to init api server`)

    const context = assertContext(service.ctx as Context)

    const config = context.cfg.services[context.cfg.service]

    const server = Fastify({ logger: true })
    // @TODO It's quite unsafe and should be properly configured
    await server.register(cors, { origin: '*' })

    server.addHook('preHandler', async (request, reply) => {
      let context = assertContext(service.ctx as Context)
      await context.modules<Module<FastifyRequest>>().filter(
        module => canServeModule(context, module) && module.route.isIntermediate()
      ).reduce(async (promise, module) => {
        if (reply.sent) {
          return
        }
        await promise
        await module.route.resolve(context)
        // Actually intermediate module can be created without handler by elevate function
        if (module.route.match(request) && module.handler != null) {
          const response = provideResponse()
          const result: Context = await module.handler(provideRequest(module.alias, request, true), response, context)
          if (result != null) {
            context = result
          }
          executeResponse(response, reply)
        }
      }, Promise.resolve());
      (request as any)._ctx = context
    })

    await Promise.all(context.modules<Module<FastifyRequest>>().filter(
      module => canServeModule(context, module) && !module.route.isIntermediate()
    ).map(
      async module => {
        await module.route.resolve(context)
        server.route({
          url: module.route.route.path,
          method: module.route.route.method ?? RouteMethod.GET,
          schema: {
            querystring: module.filter?.query ?? {},
            body: module.filter?.body,
            params: module.filter?.params ?? {},
            response: module.filter?.response,
            headers: module.filter?.headers ?? {}
          },
          handler: createServerHandler(module, location)
        })
      }
    ))

    let host = config.internalHost ?? config.host ?? HOST
    const port = config.internalPort ?? config.port ?? PORT
    if (config.internalHost == null && (config.service == null
      || config.service === context.cfg.service)) {
      // @TODO This solution can be insecure outside kubernetes or any other
      // internal network - the best way is to fix it with "kluster" config service.
      host = '0.0.0.0'
    }
    server.listen({ port, host }).then(() => {
      console.info(`${location}: server listening on ${host}${port != null ? `:${port}` : ''}`)
    })

    service.initialized = true
  })

  return server
}

export const appendApiServer = <C extends Context>(
  ctx: C, alias: string = DEFAULT_ALIAS
): UpdContextType<C, ApiServerAppend> => {
  const service = createApiServer(alias)
  console.log('Append api server')
  const _ctx = ctx as UpdContextType<C, ApiServerAppend>

  _ctx.registerService(service)
  _ctx.getApiServer = () => ctx.service(service.alias)

  return _ctx
}
