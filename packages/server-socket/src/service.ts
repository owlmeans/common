import { assertContext, createService } from '@owlmeans/context'
import type { SocketService } from './types.js'
import type { Config, Context, Request } from '@owlmeans/server-api'
import { DEFAULT_ALIAS } from './consts.js'
import type { FixerService, ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { canServerModule } from './utils/server.js'
import { fastifyWebsocket } from '@fastify/websocket'
import type { WebSocket } from '@fastify/websocket'
import {
  authorize, httpErrorHelper, makeRequestContextHelper, payloadHelper
} from '@owlmeans/server-api/utils'
import { EntrypointOutcome, provideResponse } from '@owlmeans/entrypoint'
import type { AbstractRequest, GateService } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { logger, logThrottle } from '@owlmeans/log'

const log = logger('server-socket')

export const createSocketService = (alias: string = DEFAULT_ALIAS): SocketService => {
  const service: SocketService = createService<SocketService>(alias, {
    update: async api => {
      const closeListeners: CallableFunction[] = []
      const ctx = assertContext<Config, Context>(service.ctx as Context, alias)
      await api.server.register(fastifyWebsocket, {
        preClose: () => closeListeners.forEach(listener => listener())
      })

      await api.server.register(async server => {
        server.addHook('preHandler', async (req, reply) => {
          const requestContext = makeRequestContextHelper(req)
          const context = requestContext.extractContext(service.ctx as Context, alias)
          await context?.entrypoints<ServerEntrypoint<Request>>()
            .filter(module => canServerModule(context, module) && !module.route.isIntermediate())
            .reduce<Promise<Context>>(async (ctx, module) => {
              let context = await ctx

              if (!module.route.match(req, module.mount())) {
                return context
              }

              if (reply.sent) {
                return context
              }

              try {
                const response = provideResponse(reply)
                const request = payloadHelper.provideRequest(module.alias, req, true)

                const authorized = await authorize(context, module, req, reply)
                context = authorized[0]
                module = authorized[1]

                requestContext.populateContext(context)

                // @TODO there code duplication with server-api
                const gates = module.getGates()
                for (const [srv, params] of gates) {
                  const gate: GateService = context.service(srv)
                  await gate.assert(request, response, params)
                  payloadHelper.executeResponse(response, reply, true)
                }
              } catch (error) {
                if (module.fixer != null) {
                  const fixer: FixerService = context.service(module.fixer)
                  fixer.handle(reply, ResilientError.ensure(error as Error))
                } else {
                  httpErrorHelper.handleError(error as Error, reply, httpErrorHelper.errorExposure(context.cfg))
                }
              }

              return context
            }, Promise.resolve(context))
        })

        ctx.entrypoints<ServerEntrypoint<Request>>().filter(
          module => canServerModule(ctx, module) && !module.route.isIntermediate()
        ).forEach(module => {
          if (module.handle == null) {
            return
          }

          server.get(module.mount(), {
            schema: {
              querystring: module.filter?.query ?? {},
              params: module.filter?.params ?? {},
              response: module.filter?.response,
              headers: module.filter?.headers ?? {}
            }, websocket: true
          }, (conn, req) => {
            const request = payloadHelper.provideRequest(module.alias, req, true)
            request.body = conn

            conn.on('error', (error: Error) => log.error('WebSocket error', { route: module.alias, error }))

            void module.handle<AbstractRequest<WebSocket>>(request, {
              resolve: (value, outcome) => {
                conn.send(typeof value === 'string' ? value : JSON.stringify(value))
                if (outcome === EntrypointOutcome.Ok) {
                  conn.close()
                }
              },
              reject: error => {
                const refusal = ResilientError.ensure(error)
                const details = { route: module.alias, reason: refusal.type, error }
                log.debug('Connection rejected', details)
                if (logThrottle(`socket.refused:${module.alias}:${refusal.type}`, 60_000)) {
                  log.warn('Connection rejected', details, { event: 'socket.refused' })
                }
                conn.close(1011, refusal.marshal().message)
              }
            })

            const close = () => conn.close(1001)
            closeListeners.push(close)
            conn.on('close', () => {
              const index = closeListeners.indexOf(close)
              if (index !== -1) {
                closeListeners.splice(index, 1)
              }
            })
          })
        })
      })
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}

export const appendSocketService = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = createSocketService(alias)
  const context = ctx as T

  context.registerService(service)

  return context
}
