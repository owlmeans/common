import { AuthenticationType } from '@owlmeans/auth'
import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import type { CommonConfig } from '@owlmeans/config'
import { supervisorClientPlugin } from './auth/plugins/supervisor.js'

export interface WebSupervisorAuthOptions {
  /** Force enable/disable. Default: `cfg.debug.supervisor === true`. */
  enabled?: boolean
  /**
   * Also offer it on the sign-in screen. Defaults to true — an operator login that is registered
   * but reachable only by typing its URL is a login nobody finds and an exposure nobody sees.
   */
  offer?: boolean
}

interface DebugCarrier {
  cfg: {
    debug?: { all?: boolean, supervisor?: boolean }
    security?: CommonConfig['security']
  }
}

/**
 * Whether this deployment wants the PK supervisor login.
 *
 * Reads `debug.supervisor` and deliberately NOT `debug.all`. `debug.all` is set by whole families
 * of applications for reasons that have nothing to do with authentication — a generated target
 * application sets it for itself — so gating on it hands an operator login to every one of them,
 * in production, reachable by anyone who types the URL. `debug.supervisor` is a deployment saying
 * this specific thing on purpose.
 */
const isSupervised = (context: DebugCarrier): boolean =>
  context.cfg.debug?.supervisor === true

/**
 * Unified, explicit append for the PK-based supervisor login UI. Call it once on the web client
 * context. It registers the supervisor client plugin so the form is rendered by the standard typed
 * authentication route at {@link SUPERVISOR_LOGIN_PATH}, and enables it in the sign-in screen's
 * configuration — which is what turns a `restricted` method from registered into offerable.
 */
export const appendSupervisorAuth = <T extends DebugCarrier>(
  context: T, opts?: WebSupervisorAuthOptions
): T => {
  const enabled = opts?.enabled ?? isSupervised(context)
  if (!enabled) {
    return context
  }

  authPlugins[AuthenticationType.Supervisor] = supervisorClientPlugin

  if (opts?.offer ?? true) {
    const cfg = context.cfg as CommonConfig
    cfg.security ??= {}
    cfg.security.auth ??= {}
    cfg.security.auth.login ??= {}
    const login = cfg.security.auth.login
    login.secretKey ??= true
    login.overrides ??= {}
    login.overrides[AuthenticationType.Supervisor] ??= { enabled: true }
  }

  return context
}
