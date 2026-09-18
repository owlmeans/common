import type { AccessTokenRecord } from '@owlmeans/auth-token'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export type AccessTokenResource = MongoResource<AccessTokenRecord>

export interface AuthTokenGuardOptions {
  /**
   * The prefix every token this deployment issues carries.
   *
   * Also what the guard claims on: a `Bearer` value without it is left to whatever other guard
   * the route declares.
   */
  prefix?: string
  /**
   * Routes this guard refuses even when the entrypoint declares it.
   *
   * A guard added as a coguard reaches every child of the base it was added to, and a child
   * cannot drop an inherited guard — so a route that must stay behind an interactive session
   * (opening a checkout, starting an OAuth flow, minting another token) is named here. Refusing
   * in `match` rather than in the handler is what makes the refusal a 401 rather than a route
   * that quietly works.
   */
  denyAliases?: string[]
  /** How often `lastUsedAt` may be written. Defaults to the package constant. */
  touchInterval?: number
  /** Resource alias holding the token records. */
  resourceAlias?: string
  /** Resource alias holding the identity profiles a token is bound to. */
  profileAlias?: string
}

export interface AuthTokenConfig extends ServerConfig {
  authToken?: {
    prefix?: string
  }
}

export type AuthTokenContext<C extends AuthTokenConfig = AuthTokenConfig> = ServerContext<C>
