import type { Context } from '@owlmeans/server-context'
import type { ApiServer } from './types.js'
import { Layer, createService } from '@owlmeans/context'
import { basicAssertContext } from './utils/index.js'
import Fastify, { type FastifyRequest } from 'fastify'
import { HOST, PORT } from './consts.js'
import type { Module } from '@owlmeans/server-module'
import { RouteMethod } from '@owlmeans/route'
import { createServerHandler } from './utils/context.js'

export const createApiServer = (alias: string): ApiServer => {
  const location = `service:${alias}`
  const assertContext = (context: Context | undefined): Context => basicAssertContext(context, location)

  const server = createService<ApiServer>(alias, {
    layers: [Layer.System]
  }, service => async () => {
    const context = assertContext(service.ctx as Context)

    const config = context.cfg.services[context.cfg.service]

    const server = Fastify({ logger: true })

    server.addHook('preHandler', async (request, reply) => {
      let context = assertContext(service.ctx as Context)
      await context.modules<Module<FastifyRequest>>().reduce(async (promise, module) => {
        if (reply.sent) {
          return
        }
        await promise
        if (module.route.isIntermediate() && module.route.match(request)) {
          const result = await module.handler(request, reply, context)
          if (result != null) {
            context = result
          }
        }
      }, Promise.resolve());
      (request as any)._ctx = context
    })

    context.modules<Module<FastifyRequest>>().filter(module => !module.route.isIntermediate()).forEach(
      module => server.route({
        method: module.route.route.method ?? RouteMethod.GET,
        schema: {
          querystring: module.filter?.query,
          body: module.filter?.body,
          params: module.filter?.params,
          response: module.filter?.response,
          headers: module.filter?.headers
        },
        url: module.route.route.path,
        handler: createServerHandler(module, location)
      })
    )

    server.listen({ port: config.port ?? PORT, host: config.host ?? HOST })
  })

  return server
}
