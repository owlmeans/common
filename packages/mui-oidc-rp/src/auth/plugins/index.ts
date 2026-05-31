
import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import { OIDC_CLIENT_AUTH, GOOGLE_CLIENT_AUTH } from '@owlmeans/oidc'
import { oidcClientPlugin } from './oidc-client.js'
import { googleClientPlugin } from './google-client.js'

authPlugins[OIDC_CLIENT_AUTH] = oidcClientPlugin
authPlugins[GOOGLE_CLIENT_AUTH] = googleClientPlugin

export const plugins = authPlugins
