import { createService } from '@owlmeans/context'
import type { GuardService } from '@owlmeans/entrypoint'
import { AUTH_TOKEN_SCHEME, BEARER_SCHEME } from './consts.js'
import type { TokenCarrierOptions } from './types.js'

/**
 * A client-side guard that carries one access token.
 *
 * `authMiddleware` asks every guard an entrypoint declares for `authenticated(req)` and stamps the
 * first non-null answer onto the `Authorization` header — so registering this under the alias the
 * routes already name (`DEFAULT_GUARD`, usually) makes an unchanged route declaration work for a
 * non-browser client. There is no session, no refresh and no storage: the token is a long-lived
 * credential the caller was handed, and this is the object that presents it.
 *
 * The token may be a value or a thunk, because a CLI reads it from an environment variable that a
 * long-running process should not cache past a reconfiguration.
 */
export const makeTokenCarrierGuard = (alias: string, opts: TokenCarrierOptions): GuardService => {
  const scheme = opts.scheme === BEARER_SCHEME ? 'Bearer' : AUTH_TOKEN_SCHEME.toUpperCase()

  const resolve = async (): Promise<string | null> => {
    const token = typeof opts.token === 'function' ? await opts.token() : opts.token

    return token == null || token === '' ? null : token
  }

  const service: GuardService = createService<GuardService>(alias, {
    match: async () => await resolve() != null,

    handle: async <T>() => void 0 as T,

    authenticated: async () => {
      const token = await resolve()

      return token == null ? null : `${scheme} ${token}`
    },
  }, service => async () => { service.initialized = true })

  return service
}
