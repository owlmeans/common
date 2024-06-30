
import type { FastifyReply, FastifyRequest } from 'fastify'
import { assertContext } from '@owlmeans/context'
import type { FixerService, Module } from '@owlmeans/server-module'
import type { GateService, GuardService } from '@owlmeans/module'
import { AuthFailedError } from '../errors.js'
import type { Context } from '@owlmeans/server-context'
import { ResilientError } from '@owlmeans/error'
import { OK } from '@owlmeans/api'
import { handleError } from './error.js'

export const createServerHandler = (module: Module<FastifyRequest>, location: string) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const context = assertContext<Context>((request as any)._ctx, location)
    try {
      if (module.guards != null) {
        let guard: GuardService | undefined = undefined
        for (const alias in module.guards) {
          const _guard: GuardService = context.service(alias)
          if (await _guard.match(request, reply, context)) {
            guard = _guard
            break
          }
        }

        if (guard == null) {
          throw new AuthFailedError()
        }

        if (!await guard.hanlder(request, reply, context)) {
          throw new AuthFailedError(guard.alias)
        }
      }

      if (module.gate != null) {
        let gate: GateService = context.service(module.gate)
        await gate.assert(request, reply, context)
      }

      await module.handler(request, reply, context)
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
