import { body, entrypoint, filter, guard, params } from '@owlmeans/entrypoint'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { authToken } from './consts.js'
import { AccessTokenParamsSchema, CreateAccessTokenSchema } from './schemas.js'
import type { AuthTokenEntrypointOptions } from './types.js'

/**
 * The three routes a token surface needs, ready to be spread into an application's entrypoints.
 *
 * Mounted under whatever parent the application chooses — an account section usually, so the
 * ownership gate that already protects a person's own settings protects their tokens too. A base
 * with a parent inherits its guard and its gate; a base without one carries `opts.guard`.
 *
 * Deliberately not a resource CRUD: there is no update. A token's scopes and lifetime are fixed at
 * issuance, because a token that can be widened later is a token whose grant nobody can reason
 * about from the moment it was created.
 */
export const makeAuthTokenEntrypoints = (
  opts: AuthTokenEntrypointOptions = {}
): CommonEntrypoint[] => {
  const path = opts.path ?? '/tokens'
  const base = opts.parent != null
    ? entrypoint(route(authToken.base, path, { parent: opts.parent }))
    : entrypoint(route(authToken.base, path), opts.guard != null ? guard(opts.guard) : undefined)

  return [
    base,
    entrypoint(route(authToken.list, '/', {
      parent: authToken.base, method: RouteMethod.GET
    })),
    entrypoint(
      route(authToken.create, '/', { parent: authToken.base, method: RouteMethod.POST }),
      filter(body(CreateAccessTokenSchema))
    ),
    entrypoint(
      route(authToken.revoke, '/:id', { parent: authToken.base, method: RouteMethod.DELETE }),
      filter(params(AccessTokenParamsSchema))
    ),
  ]
}
