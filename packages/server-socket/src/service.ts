import { assertContext, createService } from '@owlmeans/context'
import type { SocketService } from './types.js'
import type { Config, Context, Request } from '@owlmeans/server-api'
import { DEFAULT_ALIAS } from './consts.js'
import type { FixerService, ServerModule } from '@owlmeans/server-module'
import { canServerModule } from './utils/server.js'
import { fastifyWebsocket } from '@fastify/websocket'
import type { WebSocket } from '@fastify/websocket'
import { authorize, executeResponse, extractContext, handleError, populateContext, provideRequest } from '@owlmeans/server-api/utils'
import { ModuleOutcome, provideResponse } from '@owlmeans/module'
import type { AbstractRequest, GateService } from '@owlmeans/module'
import { ResilientError } from '@owlmeans/error'

export const createSocketService = (alias: string = DEFAULT_ALIAS): SocketService => {
  const service: SocketService = createService<SocketService>(alias, {
    update: async api => {
      console.log('Updating API service: ', alias, api.alias)
      const closeListeners: CallableFunction[] = []
      const ctx = assertContext<Config, Context>(service.ctx as Context, alias)
      api.server.register(fastifyWebsocket, {
        preClose: () => closeListeners.forEach(listener => listener())
      })

      api.server.register(async server => {
        server.addHook('preHandler', async (req, reply) => {
          const context = extractContext(req, service.ctx as Context, alias)
          await context?.modules<ServerModule<Request>>()
            .filter(module => canServerModule(context, module) && !module.route.isIntermediate())
            .reduce<Promise<Context>>(async (ctx, module) => {
              let context = await ctx
              await module.resolve()

              if (!module.route.match(req)) {
                return context
              }

              if (reply.sent) {
                return context
              }

              try {
                const response = provideResponse(reply)
                const request = provideRequest(module.alias, req, true)

                const authorized = await authorize(context, module, req, reply)
                context = authorized[0]
                module = authorized[1]

                populateContext(req, context)

                // @TODO there code duplication with server-api
                if (module.gate != null) {
                  let gate: GateService = context.service(module.gate)
                  await gate.assert(request, response)
                  executeResponse(response, reply, true)
                }

                console.log('context : ', module.ctx?.cfg.layer, module.ctx?.cfg.layerId)
              } catch (error) {
                console.log('SENDS ERROR RESPONSE: ')
                console.error(error)
                if (module.fixer != null) {
                  const fixer: FixerService = context.service(module.fixer)
                  fixer.handle(reply, ResilientError.ensure(error as Error))
                } else {
                  handleError(error as Error, reply)
                }
              }

              return context
            }, Promise.resolve(context))
        })

        await Promise.all(ctx.modules<ServerModule<Request>>().filter(
          module => canServerModule(ctx, module) && !module.route.isIntermediate()
        ).map(async module => {
          await module.resolve()
          if (module.handle == null) {
            console.log('!!! no handler for websocket module: ', module.getPath(), module.getAlias())
            return
          }

          server.get(module.getPath(), {
            schema: {
              querystring: module.filter?.query ?? {},
              params: module.filter?.params ?? {},
              response: module.filter?.response,
              headers: module.filter?.headers ?? {}
            }, websocket: true
          }, (conn, req) => {
            const request = provideRequest(module.alias, req, true)
            request.body = conn

            conn.on('open', () => {
              console.log('Connection opened...')
            })

            void module.handle<AbstractRequest<WebSocket>>(request, {
              resolve: (value, outcome) => {
                conn.send(typeof value === 'string' ? value : JSON.stringify(value))
                if (outcome === ModuleOutcome.Ok) {
                  conn.close()
                }
              },
              reject: error => {
                console.error('Connection rejected: ', error)
                conn.close(1011, ResilientError.ensure(error).marshal().message)
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
        }))
      })
    }
  }, _service => async () => {
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
