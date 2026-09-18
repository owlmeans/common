import { AppType } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertContext } from '@owlmeans/context'
import type { FixerService, ServerEntrypoint } from '@owlmeans/server-entrypoint'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import type { GateService } from '@owlmeans/entrypoint'
import { provideResponse } from '@owlmeans/entrypoint'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { ResilientError } from '@owlmeans/error'
import { OK } from '@owlmeans/api'
import { handleError } from './error.js'
import { executeResponse, provideRequest } from './payload.js'
import { authorize } from './guards.js'
import { RouteProtocols } from '@owlmeans/route'

type Config = ServerConfig
type Context = ServerContext<Config>

export const canServeModule = (context: Context, module: CommonEntrypoint): module is ServerEntrypoint<unknown> => {
  if (module.route.route.type !== AppType.Backend) {
    return false
  }
  if (module.route.route.service != null && module.route.route.service !== context.cfg.service) {
    return false
  }
  // Only the protocols HTTP actually carries. A socket is upgraded elsewhere and a queued job is
  // taken off the broker by the worker — mounting either on the HTTP server would answer it twice.
  if (module.route.route.protocol === RouteProtocols.SOCKET
    || module.route.route.protocol === RouteProtocols.QUEUE) {
    return false
  }

  return 'isIntermediate' in module.route
}

export const createServerHandler = (module: ServerEntrypoint<FastifyRequest>, location: string) =>
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

      // Don't rely on `reply.sent` here: in fastify v5 it is backed by
      // `raw.writableEnded`, which only becomes true once the socket has
      // finished writing (asynchronously), so it still reads `false`
      // synchronously right after `reply.send()`. Track the emitted state
      // explicitly instead, and only fall back to a default response when
      // neither `executeResponse` nor the handler itself (hijack) replied.
      const responded = executeResponse(response, reply, true)
      if (!responded && !reply.sent) {
        console.warn(`SENDS DEFAULT RESPONSE: ${module.alias}`)
        reply.code(OK).send(response.value)
      }
    } catch (error) {
      console.error(`Error in ${module.alias} (${location})`)
      console.error(JSON.stringify(error, null, 2))
      console.error(error)
      if (module.fixer != null) {
        const fixer: FixerService = context.service(module.fixer)
        fixer.handle(reply, ResilientError.ensure(error as Error))
        return
      }
      handleError(error as Error, reply)
    }
  }
