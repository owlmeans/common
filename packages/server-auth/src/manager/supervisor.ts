import { AuthenticationType } from '@owlmeans/auth'
import type { AuthPayload } from '@owlmeans/auth'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import type { AppConfig, AppContext } from './types.js'
import { registerPlugin } from './plugins/index.js'
import { makeSupervisorPlugin } from './plugins/supervisor.js'

/**
 * What a `SupervisorUserResolver` returns: the identity the supervisor-minted
 * token will represent. Only `userId` is required - the rest default sensibly.
 */
export interface SupervisorUserResolution extends Partial<Pick<AuthPayload,
  'profileId' | 'entityId' | 'role' | 'scopes'>> {
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
   * (e.g. OIDC) is the primary guard on protected modules. Default: true.
   */
  acceptInternalTokens?: boolean
  /** The internal-token guard to add as a coguard. Default: DEFAULT_GUARD ('auth'). */
  guard?: string
}

const DEFAULT_SUPERVISORS = ['master', 'superuser']

const isDevelopment = (context: { cfg: { debug?: { all?: boolean, supervisor?: boolean } } }): boolean =>
  context.cfg.debug?.all === true || context.cfg.debug?.supervisor === true

/**
 * Ensure the internal `Ed25519BasicToken` guard is accepted as a coguard on every
 * already-guarded backend module, so internal owlmeans tokens keep working even
 * when another guard (e.g. OIDC) is the primary guard. The primary guard stays
 * first; the internal guard is appended as a fallback (its `match` only fires for
 * an `Ed25519BasicToken` authorization header).
 */
export const setupInternalTokenCoguard = (
  modules: Array<{ guards?: string[] }>, guard: string = DEFAULT_GUARD
): void => {
  modules.forEach(module => {
    if (module.guards != null && module.guards.length > 0 && !module.guards.includes(guard)) {
      module.guards.push(guard)
    }
  })
}

/**
 * Unified, explicit append for PK-based supervisor authentication. Call it once
 * on the auth-manager server context. Development-only by default.
 *
 * It registers the supervisor auth plugin (verifies a front-end signature against
 * the allowlisted trusted keys, then resolves/registers the target user) and -
 * unless disabled - makes protected modules also accept internal owlmeans tokens
 * (requirement: understand internal tokens even when OIDC is the primary guard).
 */
export const appendSupervisorAuth = <C extends AppConfig, T extends AppContext<C>>(
  context: T, opts?: SupervisorAuthOptions
): T => {
  const enabled = opts?.enabled ?? isDevelopment(context)
  if (!enabled) {
    return context
  }

  const resolved: SupervisorPluginOptions = {
    supervisors: opts?.supervisors ?? DEFAULT_SUPERVISORS,
    allowRegistration: opts?.allowRegistration ?? true,
    resolveUser: opts?.resolveUser
  }

  registerPlugin(
    AuthenticationType.Supervisor,
    (ctx => makeSupervisorPlugin(ctx as unknown as AppContext<AppConfig>, resolved)) as Parameters<typeof registerPlugin>[1]
  )

  if (opts?.acceptInternalTokens !== false) {
    setupInternalTokenCoguard(
      context.entrypoints() as unknown as Array<{ guards?: string[] }>,
      opts?.guard ?? DEFAULT_GUARD
    )
  }

  return context
}
