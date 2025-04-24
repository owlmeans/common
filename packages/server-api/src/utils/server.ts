import { AppType } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertContext } from '@owlmeans/context'
import type { FixerService, ServerModule } from '@owlmeans/server-module'
import type { CommonModule } from '@owlmeans/module'
import type { GateService } from '@owlmeans/module'
import { provideResponse } from '@owlmeans/module'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { ResilientError } from '@owlmeans/error'
import { OK } from '@owlmeans/api'
import { handleError } from './error.js'
import { executeResponse, provideRequest } from './payload.js'
import { authorize } from './guards.js'
import { RouteProtocols } from '@owlmeans/route'

type Config = ServerConfig
type Context = ServerContext<Config>

export const canServeModule = (context: Context, module: CommonModule): module is ServerModule<unknown> => {
  if (module.route.route.type !== AppType.Backend) {
    return false
  }
  if (module.route.route.service != null && module.route.route.service !== context.cfg.service) {
    return false
  }
  if (module.route.route.protocol === RouteProtocols.SOCKET) {
    return false
  }

  return 'isIntermediate' in module.route
}

export const createServerHandler = (module: ServerModule<FastifyRequest>, location: string) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    // We passed context using fastify request object
    let context = assertContext<Config, Context>((req as any)._ctx, location)
    try {
      const authorized = await authorize(context, module, req, reply)
      context = authorized[0]
      module = authorized[1]

      const response = provideResponse(reply)
      const request = provideRequest(module.alias, req, true)

      const gates = module.getGates()
      for (const [srv, params] of gates) {
        const gate: GateService = context.service(srv)
        await gate.assert(request, response, params)
        executeResponse(response, reply, true)
      }

      await module.handle(request, response)

      executeResponse(response, reply, true)
      if (!reply.sent) {
        console.warn(`SENDS DEFAULT RESPONSE: ${module.alias}`)
        reply.code(OK).send(response.value)
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2))
      if (module.fixer != null) {
        const fixer: FixerService = context.service(module.fixer)
        fixer.handle(reply, ResilientError.ensure(error as Error))
        return
      }
      handleError(error as Error, reply)
    }
  }
