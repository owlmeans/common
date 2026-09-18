import type { ClientAuthType } from '../components/authentication/types.js'
import type { AuthenticationPlugin } from './types.js'

/**
 * The registry every authentication plugin lands in.
 *
 * It stays a plain exported object, and every registration stays a plain assignment, because four
 * packages already write into it from side-effect imports (`web-oidc-rp`, `mui-oidc-rp`,
 * `web-auth`, and this package's own `index`). Hiding it behind an API would break all of them for
 * no gain — the functions below simply read it.
 *
 * It lives in its own module rather than in `index.ts` so that the method source can read it
 * without the two importing each other.
 */
export const plugins: { [type: ClientAuthType]: AuthenticationPlugin } = {}

export const registerAuthPlugin = (plugin: AuthenticationPlugin): AuthenticationPlugin => {
  plugins[plugin.type] = plugin

  return plugin
}

export const getAuthPlugin = (type: ClientAuthType): AuthenticationPlugin | undefined =>
  plugins[type]

export const listAuthPlugins = (): AuthenticationPlugin[] => Object.values(plugins)
