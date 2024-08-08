import { isContextWithoutIds, Layer } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ServerModule } from '@owlmeans/server-module'
import type { GuardService } from '@owlmeans/module'
import { provideResponse } from '@owlmeans/module'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { executeResponse, provideRequest } from './payload.js'
import { AuthFailedError } from '../errors.js'
import type { Auth } from '@owlmeans/auth'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const authorize = async <C extends Config, T extends Context<C>>(
  context: T, module: ServerModule<FastifyRequest>,
  req: FastifyRequest, reply: FastifyReply
): Promise<[T, ServerModule<FastifyRequest>]> => {
  const guards = module.getGuards()
  if (guards.length > 0) {
    const response = provideResponse(reply)
    const request = provideRequest(module.alias, req)

    let guard: GuardService | undefined = undefined
    for (const alias of guards) {
      const _guard: GuardService = context.service(alias)
      console.log('Guard to consider: ', _guard.alias, 'on', module.alias)
      if (await _guard.match(request, response)) {
        guard = _guard
      }
      console.log('guard match', alias, guard?.alias)
      executeResponse(response, reply, true)
      if (guard != null) {
        console.log('guard found', guard.alias)
        break
      }
    }

    if (guard == null) {
      console.log('no guard found')
      throw new AuthFailedError()
    }

    const authResponse = provideResponse<Auth>(reply)
    if (!await guard.handle<boolean>(request, authResponse)) {
      console.log('guard failed', guard.alias)
      throw new AuthFailedError(guard.alias)
    }
    executeResponse(authResponse, reply, true)
    // Guard that returns true and does not provide an error is an optional guard
    // if (authResponse.value == null) {
    //   throw SyntaxError(`Guard that returns true and does not provide an error, should provide authorization`)
    // }
    request.auth = authResponse.value;
    if (request.auth != null) {
      (req as any)._auth = request.auth
    }

    if (request.auth?.entityId != null) {
      console.log('switching to entity context', request.auth.entityId)
      // @TODO Probably we need to downgrade context in this case
      if (!isContextWithoutIds(context as any)) {
        throw SyntaxError(`Context should be without ids during authorization ${context.cfg.layer}:${context.cfg.layerId}`)
      }

      if (isContextWithoutIds(context as any) && context.cfg.layer !== Layer.Service) {
        console.log('align context with service layer, waiting for initialization...')
        context = await context.updateContext(undefined, Layer.Service)
        await context.waitForInitialized()
        console.log('context intialized after update')
      }
      console.log(`align context with entity id ${request.auth.entityId} layer, waiting for initialization...`)
      context = await context.updateContext(request.auth.entityId, Layer.Entity)
      await context.waitForInitialized()
      console.log('context intialized after update')

      // We elevate module to the context level if it was changed
      module = context.module(module.alias)
      await module.resolve()
    }
  }
  // Update context in request object
  (req as any)._ctx = context

  return [context, module]
}
