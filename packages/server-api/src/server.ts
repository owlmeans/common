import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ApiServer, ApiServerAppend } from './types.js'
import { Layer, assertContext, createService } from '@owlmeans/context'
import { canServeModule, executeResponse, provideRequest } from './utils/index.js'
import { DEFAULT_ALIAS, CLOSED_HOST, PORT, OPENED_HOST } from './consts.js'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { RouteMethod } from '@owlmeans/route'
import { createServerHandler, fixFormatDates } from './utils/index.js'
import { provideResponse } from '@owlmeans/entrypoint'
import { TOKEN_UPDATE } from '@owlmeans/auth-common'

import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import rawBody from 'fastify-raw-body'
import Middie from '@fastify/middie'
import Helmet from '@fastify/helmet'
import Multipart from '@fastify/multipart'

import formatsPlugin from 'ajv-formats'
import Ajv from 'ajv'
import ajvErrors from "ajv-errors"


const ajv = new Ajv({
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
  allErrors: true,
  strict: false
})
formatsPlugin(ajv)
ajvErrors(ajv, { singleError: true })

type Config = ServerConfig
type Context = ServerContext<Config>

const bodyLimit = 1024 * 1024 * 20

export const createApiServer = (alias: string): ApiServer => {
  const location = `service:${alias}`
  const _assertContext = (context: Context | undefined): Context => assertContext<Config, Context>(context, location)

  const service = createService<ApiServer>(alias, {
    server: Fastify({
      logger: true,
      bodyLimit,
      /*{
       transport: {
         target: 'pino-pretty',
         options: {
           singleLine: true,
           translateTime: 'HH:MM:ss Z',
           ignore: 'pid,hostname',
         },
       },
     }*/
    }),

    layers: [Layer.System],

    listen: async () => {
      const context = _assertContext(service.ctx as Context)

      const config = context.cfg.services[context.cfg.service]

      const port = config?.internalPort ?? config?.port ?? PORT
      const host = config.opened === true ? OPENED_HOST : CLOSED_HOST
      await service.server.listen({ port, host })
      console.info(`${location}: server listening on ${host}${port != null ? `:${port}` : ''}`)

      process.on('SIGTERM', () => {
        service.server.close().then(() => {
          process.exit(0)
        })
      })
    }
  }, service => async () => {
    if (service.server.server.listening) {
      await service.server.close()
      service.server = Fastify({ logger: true, bodyLimit })
    }

    const context = _assertContext(service.ctx as Context)

    const server = service.server
    // @TODO We should ensure some way that Resilient Error is thrown and go to the flow
    server.setValidatorCompiler(opts => ajv.compile(opts.schema))
    // @TODO It's quite unsafe and should be properly configured
    await server.register(cors, {
      origin: '*',
      // `@fastify/cors` v11 narrowed its default `methods` to 'GET,HEAD,POST'
      // (v10 defaulted to the full set). `RouteMethod` also declares PUT, PATCH
      // and DELETE, so relying on the default makes the preflight answer
      // `Access-Control-Allow-Methods: GET,HEAD,POST` and the browser rejects
      // every non-GET/POST call with "Method PUT is not allowed by
      // Access-Control-Allow-Methods in preflight response". Server-to-server
      // callers are unaffected, so this only ever breaks the browser — declare
      // the framework's full method set explicitly instead of inheriting a default.
      methods: [
        ...Object.values(RouteMethod).map(method => method.toUpperCase()),
        'HEAD', 'OPTIONS'
      ],
      exposedHeaders: [TOKEN_UPDATE]
    })

    await server.register(Multipart, {
      throwFileSizeLimit: true,
      // @TODO It shouldn't be this way, becaues the file is buffer this way
      attachFieldsToBody: 'keyValues',
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5,
      }
    })
    await server.register(Helmet)
    await server.register(rawBody, { field: 'rawBody', global: true, runFirst: true })
    await server.register(Middie)

    server.addHook('preHandler', async (request, reply) => {
      const context = _assertContext(service.ctx as Context)
      // Track whether an intermediate already committed a response. We can't
      // rely on `reply.sent` for this in fastify v5 — it is backed by the
      // async `raw.writableEnded`, so it reads `false` synchronously right
      // after `reply.send()` and would let the next intermediate reply again.
      let responded = false;
      // We pass context further using fastify request object
      (request as any)._ctx = await context.entrypoints<ServerEntrypoint<FastifyRequest>>().filter(
        module => canServeModule(context, module) && module.route.isIntermediate()
      ).reduce<Promise<Context>>(async (promise, module) => {
        let context = await promise
        if (responded || reply.sent) {
          return context
        }

        // await module.route.resolve(context as any)
        await module.resolve()
        // Actually intermediate module can be created without handler by elevate function
        if (module.route.match(request) && module.handle != null) {
          const response = provideResponse(reply)
          const currentRequest = provideRequest(module.alias, request, true)
          currentRequest.original._ctx = context
          const result: Context = await module.handle(currentRequest, response)
          if (result != null) {
            context = result
          }
          responded = executeResponse(response, reply, true) || responded
        }
        return context
      }, Promise.resolve(context))
    })

    await Promise.all(
      context.entrypoints<ServerEntrypoint<FastifyRequest>>()
        .filter(module => canServeModule(context, module) && !module.route.isIntermediate())
        .map(async module => {
          // await module.route.resolve(context as any)
          await module.resolve()
          const method = module.route.route.method ?? RouteMethod.GET
          if (module.handle == null) {
            return
          }
          server.route({
            url: module.getPath(), method,
            schema: {
              consumes: [
                'application/json',
                'application/x-www-form-urlencoded',
                'multipart/form-data',
              ],
              querystring: fixFormatDates(module.filter?.query ?? {}),
              ...(
                [
                  RouteMethod.POST,
                  RouteMethod.PATCH,
                  RouteMethod.PUT
                ].includes(method)
                  ? { body: fixFormatDates(module.filter?.body ?? {}) }
                  : {}
              ),
              params: fixFormatDates(module.filter?.params ?? {}),
              response: module.filter?.response,
              headers: fixFormatDates(module.filter?.headers ?? {})
            },
            handler: createServerHandler(module, location)
          })
        })
    )

    service.initialized = true
  })

  return service
}

export const appendApiServer = <C extends Config, T extends ServerContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & ApiServerAppend => {
  const service = createApiServer(alias)
  const context = ctx as T & ApiServerAppend

  context.registerService(service)

  if (context.getApiServer == null) {
    context.getApiServer = () => ctx.service(service.alias)
  }

  return context
}


