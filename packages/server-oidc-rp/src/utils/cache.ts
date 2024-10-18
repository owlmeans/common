import type { Resource } from '@owlmeans/resource'
import type { OIDCAuthCache } from './types.js'
import type {  Config, Context } from '../types.js'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { OIDC_TOKEN_STORE } from '../consts.js'

export const cache = <C extends Config, T extends Context<C>>(context: T): Resource<OIDCAuthCache> =>
  context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE)

export const verifierId = (challenge: string) => `${OIDC_TOKEN_STORE}:verifier:${challenge}`
export const exchangeId = (exchange: string) => `${OIDC_TOKEN_STORE}:exchange:${exchange}`
export const managedId = (token: string) => `${OIDC_TOKEN_STORE}:token:${token}`
