import { handler } from '@owlmeans/client'
import { bindScreen } from '@owlmeans/client-entrypoint'
import type { MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { MarketingConsentScreen } from './components/screen.js'

/**
 * The marketing-consent screen, bound and ready to spread into an application's entrypoint list —
 * the whole of what a web app has to do beyond calling `appendMarketingConsent`.
 *
 * `status`/`save`/`terms`/`base` are NOT bound here: they are ordinary backend routes, bound by
 * the app's own `bindAll` alongside the matching server handlers
 * (`@owlmeans/server-marketing-consent`'s `serveMarketingConsentEntrypoints`) — the same split
 * `@owlmeans/web-oauth`'s `oauthEntrypoints` draws for its own consent API.
 */
export const marketingConsentEntrypoints = (protocols: MarketingConsentEntrypoints) => [
  bindScreen(protocols.screen, handler(MarketingConsentScreen)),
]
