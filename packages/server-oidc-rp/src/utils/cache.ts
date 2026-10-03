import type { Resource } from '@owlmeans/resource'
import { AuthorizationError } from '@owlmeans/auth'
import type { OIDCAuthCache } from './types.js'
import type {  Config, Context } from '../types.js'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { OIDC_AUTH_LIFTETIME, OIDC_TOKEN_STORE } from '../consts.js'

export const cache = <C extends Config, T extends Context<C>>(context: T): Resource<OIDCAuthCache> =>
  context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE)

export const verifierId = (challenge: string) => `${OIDC_TOKEN_STORE}:verifier:${challenge}`
export const exchangeId = (exchange: string) => `${OIDC_TOKEN_STORE}:exchange:${exchange}`
export const managedId = (token: string) => `${OIDC_TOKEN_STORE}:token:${token}`

/** The TTL a session record is saved with: what is left of its absolute expiry, never more. */
export const sessionTtl = (expiresAt: number | undefined): number => {
  if (expiresAt == null) return OIDC_AUTH_LIFTETIME / 1000
  const ttl = Math.ceil((expiresAt - Date.now()) / 1000)
  if (ttl <= 0) throw new AuthorizationError('session')
  return ttl
}

/**
 * The session record behind a wrapped token. A missing one is a session that is gone — signed out,
 * expired, evicted — and the caller signs in again; a bare `get` would let the storage refusal
 * escape as "not found".
 */
export const sessionRecord = async <C extends Config, T extends Context<C>>(
  context: T, token: string
): Promise<OIDCAuthCache> => {
  const record = await cache<C, T>(context).load(managedId(token))
  if (record == null) {
    throw new AuthorizationError('record')
  }

  return record
}
