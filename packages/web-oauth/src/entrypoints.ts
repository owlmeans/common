import { handler } from '@owlmeans/client'
import { bindScreen } from '@owlmeans/client-entrypoint'
import { makeOAuthProtocols } from '@owlmeans/oauth'
import type { OAuthEntrypointOptions } from '@owlmeans/oauth'
import { OAuthConsentScreen } from './components/consent-screen.js'
import { OAuthDeviceScreen } from './components/device-screen.js'
import { OAuthDoneScreen } from './components/done-screen.js'

/**
 * The three screens, bound to their components and ready to spread into an application's
 * entrypoint list — the whole of what a web app has to do beyond calling `appendOAuthScreens`
 * and configuring the server package with matching aliases.
 */
export const oauthEntrypoints = (opts?: OAuthEntrypointOptions) => {
  const protocols = makeOAuthProtocols(opts)

  return [
    bindScreen(protocols.consentScreen, handler(OAuthConsentScreen)),
    bindScreen(protocols.deviceScreen, handler(OAuthDeviceScreen)),
    bindScreen(protocols.doneScreen, handler(OAuthDoneScreen)),
  ]
}
