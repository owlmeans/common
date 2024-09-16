
import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { oidcClientPlugin } from './oidc-client.js'

authPlugins[OIDC_CLIENT_AUTH] = oidcClientPlugin

export const plugins = authPlugins
