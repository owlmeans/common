import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ApiServer, ApiServerAppend } from './types.js'
import { Layer, assertContext, createService } from '@owlmeans/context'
import { canServeModule, executeResponse, provideRequest } from './utils/index.js'
import { DEFAULT_ALIAS, CLOSED_HOST, PORT, OPENED_HOST } from './consts.js'
import type { ServerModule } from '@owlmeans/server-module'
import { RouteMethod } from '@owlmeans/route'
import { createServerHandler } from './utils/server.js'
import { provideResponse } from '@owlmeans/module'

import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'

type Config = ServerConfig
type Context = ServerContext<Config>

export const createApiServer = (alias: string): ApiServer => {
  const location = `service:${alias}`
  const _assertContext = (context: Context | undefined): Context => assertContext<Config, Context>(context, location)

  const service = createService<ApiServer>(alias, {
    layers: [Layer.System],

    listen: async () => {
      const context = _assertContext(service.ctx as Context)

      const config = context.cfg.services[context.cfg.service]

      const port = config?.internalPort ?? config?.port ?? PORT
      const host = config.opened === true ? OPENED_HOST : CLOSED_HOST
      console.log('Try to listen on: ', host, port)
      await service.server.listen({ port, host })
      console.info(`${location}: server listening on ${host}${port != null ? `:${port}` : ''}`)

      process.on('SIGTERM', () => {
        console.log(`Closing http server: ${alias}`)
        service.server.close().then(() => {
          console.log(`Http server closed: ${alias}`)
          process.exit(0)
        })
      })
    }
  }, service => async () => {
    console.log(`${location}: ready to init api server`)

    const context = _assertContext(service.ctx as Context)

    const server = Fastify({ logger: true })
    // @TODO It's quite unsafe and should be properly configured
    await server.register(cors, { origin: '*' })

    server.addHook('preHandler', async (request, reply) => {
      let context = _assertContext(service.ctx as Context)
      await context.modules<ServerModule<FastifyRequest>>().filter(
        module => canServeModule(context, module) && module.route.isIntermediate()
      ).reduce(async (promise, module) => {
        if (reply.sent) {
          return
        }
        await promise
        await module.route.resolve(context as any)
        // Actually intermediate module can be created without handler by elevate function
        if (module.route.match(request) && module.handle != null) {
          const response = provideResponse()
          const result: Context = await module.handle(provideRequest(module.alias, request, true), response)
          if (result != null) {
            context = result
          }
          executeResponse(response, reply, true)
        }
      }, Promise.resolve());
      // We pass context further using fastify request object
      (request as any)._ctx = context
    })

    await Promise.all(
      context.modules<ServerModule<FastifyRequest>>()
        .filter(module => canServeModule(context, module) && !module.route.isIntermediate())
        .map(async module => {
          await module.route.resolve(context as any)
          const method = module.route.route.method ?? RouteMethod.GET
          if (module.handle == null) {
            console.log('!!! no handler for module: ', module.getPath(), module.getAlias())
            return
          }
          console.log('))) listen module: ', module.getPath(), module.getAlias())
          server.route({
            url: module.getPath(), method,
            schema: {
              querystring: module.filter?.query ?? {},
              ...(method !== RouteMethod.GET ? { body: module.filter?.body } : {}),
              params: module.filter?.params ?? {},
              response: module.filter?.response,
              headers: module.filter?.headers ?? {}
            },
            handler: createServerHandler(module, location)
          })
        })
    )

    service.server = server

    service.initialized = true
  })

  return service
}

export const appendApiServer = <C extends Config, T extends ServerContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & ApiServerAppend => {
  const service = createApiServer(alias)
  console.log('Append api server')
  const context = ctx as T & ApiServerAppend

  context.registerService(service)

  context.getApiServer = () => ctx.service(service.alias)

  return context
}
