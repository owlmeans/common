
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertContext } from '@owlmeans/context'
import type { FixerService, Module } from '@owlmeans/server-module'
import type { GateService, GuardService } from '@owlmeans/module'
import { AuthFailedError } from '../errors.js'
import type { Context } from '@owlmeans/server-context'
import { ResilientError } from '@owlmeans/error'
import { OK } from '@owlmeans/api'
import { handleError } from './error.js'
import { executeResponse, provideRequest, provideResponse } from './payload.js'

export const createServerHandler = (module: Module<FastifyRequest>, location: string) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const context = assertContext<Context>((request as any)._ctx, location)
    try {
      if (module.guards != null) {
        let guard: GuardService | undefined = undefined
        for (const alias in module.guards) {
          const _guard: GuardService = context.service(alias)
          const response = provideResponse()
          if (await _guard.match(provideRequest(module.alias, request), response, context)) {
            guard = _guard
            break
          }
          executeResponse(response, reply, true)
        }

        if (guard == null) {
          throw new AuthFailedError()
        }

        const response = provideResponse()
        if (!await guard.hanlder(provideRequest(module.alias, request), response, context)) {
          throw new AuthFailedError(guard.alias)
        }
        executeResponse(response, reply, true)
      }

      if (module.gate != null) {
        let gate: GateService = context.service(module.gate)
        const response = provideResponse()
        await gate.assert(provideRequest(module.alias, request), response, context)
        executeResponse(response, reply, true)
      }

      const response = provideResponse()
      await module.handler(provideRequest(module.alias, request), response, context)
      executeResponse(response, reply, true)
      if (!reply.sent) {
        reply.code(OK).send()
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
