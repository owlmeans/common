import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ApiServer, ApiServerAppend } from './types.js'
import { Layer, assertContext, createService } from '@owlmeans/context'
import { canServeModule, executeResponse, provideRequest } from './utils/index.js'
import { DEFAULT_ALIAS, HOST, PORT } from './consts.js'
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

  const server = createService<ApiServer>(alias, {
    layers: [Layer.System]
  }, service => async () => {
    console.log(`${location}: ready to init api server`)

    const context = _assertContext(service.ctx as Context)

    const config = context.cfg.services[context.cfg.service]

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
          console.log('register module: ', module.getPath(), module.getAlias())
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
