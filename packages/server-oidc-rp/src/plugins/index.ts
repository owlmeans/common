
import { plugins as authPlugins } from '@owlmeans/server-auth/manager'
import { oidcClientPlugin } from './oidc-client.js'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'

authPlugins[OIDC_CLIENT_AUTH] = oidcClientPlugin as typeof authPlugins[keyof typeof authPlugins]

export const plugins = authPlugins
