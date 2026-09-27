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
  /**
   * The resource(s) this guard speaks for, opting it into audience admission.
   *
   * Left unset (the default), the guard admits every token whatever its `audience` — full
   * backward compatibility for a deployment that never mints an audience-restricted token. Set
   * it to the canonical resource URI(s) this route surface serves, and a token issued FOR a
   * different resource (an OAuth-issued, MCP-only token, say) is refused here rather than
   * quietly working everywhere the profile's scopes would otherwise reach.
   *
   * A function is resolved with the live context on every request rather than once at
   * registration time — `appendAuthTokenGuard` runs from `makeContext`, before a hostname a
   * Kubernetes secret mount populates is necessarily readable yet, and this guard's `handle`
   * already runs per-request regardless.
   */
  resources?: string[] | ((context: AuthTokenContext) => string[])
}

export interface AuthTokenConfig extends ServerConfig {
  authToken?: {
    prefix?: string
  }
}

export type AuthTokenContext<C extends AuthTokenConfig = AuthTokenConfig> = ServerContext<C>
