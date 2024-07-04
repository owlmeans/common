
import { plugins as basicPlugins } from '@owlmeans/client-auth'
import type { ClientAuthType } from '@owlmeans/client-auth'
import type { AuthenticationPlugin } from '@owlmeans/client-auth/plugins'
import { AuthenticationType } from '@owlmeans/auth'
import { Ed22519BasicAuthUIPlugin } from './basic-ed25519.js'

basicPlugins[AuthenticationType.BasicEd25519].Renderer = Ed22519BasicAuthUIPlugin

export const plugins: { [type: ClientAuthType]: AuthenticationPlugin } = basicPlugins
