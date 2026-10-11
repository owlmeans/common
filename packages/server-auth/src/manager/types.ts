import type { AllowanceRequest, AllowanceResponse, Auth, AuthCredentials, AuthToken, RelyToken, AuthPayload } from '@owlmeans/auth'
import type { KlusterConfig } from '@owlmeans/kluster'
import type { GuardService } from '@owlmeans/entrypoint'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import type { ServiceRoute } from '@owlmeans/server-route'
import type { Connection } from '@owlmeans/socket'
import type { StaticResourceAppend } from '@owlmeans/static-resource'

export interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}

export interface AuthModel {
  init: (request: AllowanceRequest) => Promise<AllowanceResponse>

  authenticate: (credential: AuthCredentials) => Promise<AuthToken>

  rely: (conn: Connection, source?: Auth | null) => Promise<void>
}

export interface AppContext<C extends AppConfig = AppConfig> extends ServerContext<C>
  , ApiServerAppend
  , StaticResourceAppend { }

export interface RelyService extends GuardService {
}

export interface RelyAllowanceRequest extends AllowanceRequest {
  auth?: Auth
  provideRely?: RelyLinker
  conn?: Connection
}

export interface RelyLinker {
  (rely: RelyToken, source: RelyToken, notify?: boolean): Promise<void>
}

export interface RelyCarrier {
  source: RelyToken,
  rely: RelyToken
}

/**
 * What a `SupervisorUserResolver` returns: the identity the supervisor-minted
 * token will represent. Only `userId` is required - the rest default sensibly.
 */
export interface SupervisorUserResolution extends Partial<Pick<AuthPayload,
  'profileId' | 'entitySlug' | 'role' | 'scopes'>> {
  userId: string
}

/**
 * Find-or-create the target identity for a supervisor login. `register` reflects
 * `allowRegistration`; when false the resolver should only look existing users up.
 * Wire this to the project's identity store (e.g. `@owlmeans/server-auth-identity`).
 */
export interface SupervisorUserResolver {
  <C extends AppConfig, T extends AppContext<C>>(
    userId: string, context: T, opts: { register: boolean }
  ): Promise<SupervisorUserResolution>
}

/** Resolved options handed to the plugin factory. */
export interface SupervisorPluginOptions {
  supervisors: string[]
  allowRegistration: boolean
  resolveUser?: SupervisorUserResolver
}

export interface SupervisorAuthOptions {
  /** Trusted-record aliases authorized to act as supervisor. Default: master + superuser. */
  supervisors?: string[]
  /** Find-or-create the target user by id/email. Default: trust the id as-is. */
  resolveUser?: SupervisorUserResolver
  /** Allow minting a token for an unknown user (registration). Default: true. */
  allowRegistration?: boolean
  /** Force enable/disable. Default: development only (cfg.debug.all || cfg.debug.supervisor). */
  enabled?: boolean
  /**
   * Also accept internal owlmeans `Ed25519BasicToken`s even when another guard
   * (e.g. OIDC) is the primary guard on protected entrypoints. Default: true.
   */
  acceptInternalTokens?: boolean
  /** The internal-token guard to add as a coguard. Default: DEFAULT_GUARD ('auth'). */
  guard?: string
}
