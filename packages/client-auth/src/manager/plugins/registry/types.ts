import type { ClientAuthType } from '../../components/authentication/types.js'
import type { AuthenticationPlugin } from '../types.js'

/** Reads and writes of the global authentication-plugin registry. */
export interface AuthPluginHelper {
  /** Register a plugin under its own `type`, replacing an earlier one; answers the plugin. */
  registerAuthPlugin: (plugin: AuthenticationPlugin) => AuthenticationPlugin
  getAuthPlugin: (type: ClientAuthType) => AuthenticationPlugin | undefined
  listAuthPlugins: () => AuthenticationPlugin[]
}
