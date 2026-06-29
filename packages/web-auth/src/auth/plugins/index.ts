import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import { AuthenticationType } from '@owlmeans/auth'
import { supervisorClientPlugin } from './supervisor.js'

// Side-effect registration into the shared client auth plugin registry. Prefer
// the dev-gated `appendSupervisorAuth` for explicit, environment-aware wiring;
// this import is the always-on alternative (mirrors @owlmeans/web-oidc-rp).
authPlugins[AuthenticationType.Supervisor] = supervisorClientPlugin

export const plugins = authPlugins
export { supervisorClientPlugin }
