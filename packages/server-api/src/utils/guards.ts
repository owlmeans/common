import { isContextWithoutIds, Layer } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import type { GuardService } from '@owlmeans/entrypoint'
import { provideResponse } from '@owlmeans/entrypoint'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { executeResponse, provideRequest } from './payload.js'
import { AuthFailedError } from '../errors.js'
import type { Auth } from '@owlmeans/auth'
import { entitySlugOf } from '@owlmeans/auth'
import { attachEntity } from '@owlmeans/auth-common'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const authorize = async <C extends Config, T extends Context<C>>(
  context: T, module: ServerEntrypoint<FastifyRequest>,
  req: FastifyRequest, reply: FastifyReply
): Promise<[T, ServerEntrypoint<FastifyRequest>]> => {
  const guards = module.getGuards()
  if (guards.length > 0) {
    const response = provideResponse(reply)
    const request = provideRequest(module.alias, req)

    let guard: GuardService | undefined = undefined
    for (const alias of guards) {
      const _guard: GuardService = context.service(alias)
      if (await _guard.match(request, response)) {
        guard = _guard
      }
      executeResponse(response, reply, true)
      if (guard != null) {
        break
      }
    }

    if (guard == null) {
      throw new AuthFailedError()
    }

    const authResponse = provideResponse<Auth>(reply)
    if (!await guard.handle<boolean>(request, authResponse)) {
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

    // The token names the organization by slug; everything downstream — grants, records, minted
    // infrastructure names — keys on the entity's stable id. Resolving here, once, is what keeps a
    // rename from being a sweep of every handler: the id arrives on the request, and a slug that
    // has since been retired still resolves to the entity that retired it.
    const entitySlug = entitySlugOf(request.auth)
    const entity = await attachEntity(context, request)
    if (entity != null) {
      // Carried on the raw request the same way `_auth` is, so the request the handler is given
      // later — a different object, built after this runs — sees the same resolution.
      ;(req as any)._entity = entity
    }

    if (entitySlug != null) {
      // @TODO Probably we need to downgrade context in this case
      if (!isContextWithoutIds(context as any)) {
        throw SyntaxError(`Context should be without ids during authorization ${context.cfg.layer}:${context.cfg.layerId}`)
      }

      if (isContextWithoutIds(context as any) && context.cfg.layer !== Layer.Service) {
        context = await context.updateContext(undefined, Layer.Service)
        await context.waitForInitialized()
      }
      // The layer is keyed by the stable id where one exists — a per-entity database or schema
      // name derived from a renameable slug would be orphaned by the first rename.
      context = await context.updateContext(request.entity?.id ?? entitySlug, Layer.Entity)
      await context.waitForInitialized()

      // We elevate module to the context level if it was changed
      module = context.entrypoint(module.alias)
      await module.resolve()
    }
  }
  // Update context in request object
  (req as any)._ctx = context

  return [context, module]
}
