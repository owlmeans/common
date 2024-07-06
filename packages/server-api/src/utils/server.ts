import { AppType, isContextWithoutIds, Layer } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertContext } from '@owlmeans/context'
import type { FixerService, Module } from '@owlmeans/server-module'
import type { Module as BasicModule } from '@owlmeans/module'
import type { GateService, GuardService } from '@owlmeans/module'
import { provideResponse } from '@owlmeans/module'
import { AuthFailedError } from '../errors.js'
import type { Context } from '@owlmeans/server-context'
import { ResilientError } from '@owlmeans/error'
import { OK } from '@owlmeans/api'
import { handleError } from './error.js'
import { executeResponse, provideRequest } from './payload.js'
import type { Auth } from '@owlmeans/auth'
export { makeContext as makeBasicContext } from '@owlmeans/server-context'

export const canServeModule = (context: Context, module: BasicModule): module is Module<unknown> => {
  if (module.route.route.type !== AppType.Backend) {
    return false
  }
  if (module.route.route.service != null && module.route.route.service !== context.cfg.service) {
    return false
  }

  return 'isIntermediate' in module.route
}

export const createServerHandler = (module: Module<FastifyRequest>, location: string) =>
  async (_request: FastifyRequest, reply: FastifyReply) => {
    let context = assertContext<Context>((_request as any)._ctx, location)
    try {
      const response = provideResponse(reply)
      const request = provideRequest(module.alias, _request)

      if (module.guards != null) {
        let guard: GuardService | undefined = undefined
        for (const alias in module.guards) {
          const _guard: GuardService = context.service(alias)

          if (await _guard.match(request, response)) {
            guard = _guard
            break
          }
          executeResponse(response, reply, true)
        }

        if (guard == null) {
          throw new AuthFailedError()
        }

        const authResponse = provideResponse<Auth>(reply)
        if (!await guard.handle<boolean>(request, authResponse)) {
          throw new AuthFailedError(guard.alias)
        }
        executeResponse(authResponse, reply, true)
        if (authResponse.value == null) {
          throw SyntaxError(`Guard that returns true and does not provide an error, should provide authorization`)
        }
        request.auth = authResponse.value

        if (request.auth.entityId != null) {
          // @TODO Probably we need to downgrade context in this case
          if (!isContextWithoutIds(context)) {
            throw SyntaxError(`Context should be without ids during authorization ${context.cfg.layer}:${context.cfg.layerId}`)
          }

          if (isContextWithoutIds(context) && context.cfg.layer !== Layer.Service) {
            context = context.updateContext(undefined, Layer.Service)
            await context.waitForInitialized()
          }
          context = context.updateContext(request.auth.entityId, Layer.Entity)
          await context.waitForInitialized()

          // We elevate module to the context level if it was changed
          module = context.module(module.alias)
        }
      }

      if (module.gate != null) {
        let gate: GateService = context.service(module.gate)
        await gate.assert(request, response)
        executeResponse(response, reply, true)
      }

      await module.handle(request, response)
      executeResponse(response, reply, true)
      if (!reply.sent) {
        console.warn(`SENDS DEFAULT RESPONSE: ${module.alias}`)
        reply.code(OK).send(response.value)
      }
    } catch (error) {
      if (module.fixer != null) {
        const fixer: FixerService = context.service(module.fixer)
        fixer.handle(reply, ResilientError.ensure(error as Error))
        return
      }
      handleError(error as Error, reply)
    }
  }
