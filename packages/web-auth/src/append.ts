import { AuthenticationType } from '@owlmeans/auth'
import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import { supervisorClientPlugin } from './auth/plugins/supervisor.js'

export interface WebSupervisorAuthOptions {
  /** Force enable/disable. Default: development only (cfg.debug.all || cfg.debug.supervisor). */
  enabled?: boolean
}

const isDevelopment = (context: { cfg: { debug?: { all?: boolean, supervisor?: boolean } } }): boolean =>
  context.cfg.debug?.all === true || context.cfg.debug?.supervisor === true

/**
 * Unified, explicit append for the PK-based supervisor login UI. Call it once on
 * the web client context. Development-only by default. It registers the
 * supervisor client plugin so the form is rendered by the standard typed
 * authentication route at {@link SUPERVISOR_LOGIN_PATH}.
 */
export const appendSupervisorAuth = <T extends { cfg: { debug?: { all?: boolean, supervisor?: boolean } } }>(
  context: T, opts?: WebSupervisorAuthOptions
): T => {
  const enabled = opts?.enabled ?? isDevelopment(context)
  if (!enabled) {
    return context
  }

  authPlugins[AuthenticationType.Supervisor] = supervisorClientPlugin

  return context
}
