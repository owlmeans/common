import { AuthenticationType } from '@owlmeans/auth'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import type { AppConfig, AppContext, SupervisorAuthOptions, SupervisorPluginOptions } from './types.js'
import type { AuthPluginFactory } from './plugins/types.js'
import { registerPlugin } from './plugins/index.js'
import { makeSupervisorPlugin } from './plugins/supervisor.js'
import { DEFAULT_SUPERVISORS } from './consts.local.js'

const isDevelopment = (context: { cfg: { debug?: { all?: boolean, supervisor?: boolean } } }): boolean =>
  context.cfg.debug?.all === true || context.cfg.debug?.supervisor === true

/**
 * Ensure the internal `Ed25519BasicToken` guard is accepted as a coguard on every
 * already-guarded backend entrypoint, so internal owlmeans tokens keep working even
 * when another guard (e.g. OIDC) is the primary guard. The primary guard stays
 * first; the internal guard is appended as a fallback (its `match` only fires for
 * an `Ed25519BasicToken` authorization header).
 */
export const setupInternalTokenCoguard = (
  entrypoints: Array<{ guards?: string[] }>, guard: string = DEFAULT_GUARD
): void => {
  entrypoints.forEach(module => {
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
 * unless disabled - makes protected entrypoints also accept internal owlmeans tokens
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
    (ctx => makeSupervisorPlugin(ctx as unknown as AppContext<AppConfig>, resolved)) as AuthPluginFactory
  )

  if (opts?.acceptInternalTokens !== false) {
    setupInternalTokenCoguard(
      context.entrypoints() as unknown as Array<{ guards?: string[] }>,
      opts?.guard ?? DEFAULT_GUARD
    )
  }

  return context
}
