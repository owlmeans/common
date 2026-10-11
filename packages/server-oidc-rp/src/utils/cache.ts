import type { Resource } from '@owlmeans/resource'
import { AuthorizationError } from '@owlmeans/auth'
import { memoHelper } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { OIDCAuthCache } from './types.js'
import type { Config, Context } from '../types.js'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { OIDC_AUTH_LIFTETIME, OIDC_TOKEN_STORE } from '../consts.js'
import type { OidcCacheHelper } from './cache/types.js'

export const makeOidcCacheHelper = (context: Context): OidcCacheHelper => {
  const resource = (): Resource<OIDCAuthCache> =>
    context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE)

  const verifierId = (challenge: string): string => `${OIDC_TOKEN_STORE}:verifier:${challenge}`
  const exchangeId = (exchange: string): string => `${OIDC_TOKEN_STORE}:exchange:${exchange}`
  const managedId = (token: string): string => `${OIDC_TOKEN_STORE}:token:${token}`

  const sessionTtl = (expiresAt: number | undefined): number => {
    if (expiresAt == null) return OIDC_AUTH_LIFTETIME / 1000
    const ttl = Math.ceil((expiresAt - Date.now()) / 1000)
    if (ttl <= 0) throw new AuthorizationError('session')
    return ttl
  }

  const sessionRecord = async (token: string): Promise<OIDCAuthCache> => {
    const record = await resource().load(managedId(token))
    if (record == null) {
      throw new AuthorizationError('record')
    }

    return record
  }

  const sessionOf = async (req: AbstractRequest): Promise<OIDCAuthCache> => {
    if (req.auth == null) {
      throw new AuthorizationError('auth')
    }

    return sessionRecord(req.auth.token)
  }

  return { resource, verifierId, exchangeId, managedId, sessionTtl, sessionRecord, sessionOf }
}

/** The OIDC cache helper of a context — one per context. */
export const oidcCacheOf = memoHelper.oncePer(makeOidcCacheHelper)

/** @deprecated compat:factory-refactor — use `oidcCacheOf(ctx).sessionRecord(…)` */
export const sessionRecord = async <C extends Config, T extends Context<C>>(
  context: T, token: string
): Promise<OIDCAuthCache> => oidcCacheOf(context).sessionRecord(token)
