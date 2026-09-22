import { bind } from '@owlmeans/server-entrypoint'
import type { MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { marketingConsentStatus, recordTermsAcceptance, saveMarketingConsent } from './handlers.js'
import type { MarketingConsentHandlerOptions } from './handlers.js'

/**
 * Bind this package's handlers to a tree declared by `makeMarketingConsentProtocols` — one binding
 * per protocol that needs a server implementation. `base` and `screen` carry no handler of their
 * own (a mounting anchor and a frontend address, the same shape as `@owlmeans/oauth`'s own consent
 * screens) and are left for the application's route tree to materialize.
 */
export const serveMarketingConsentEntrypoints = (
  protocols: MarketingConsentEntrypoints, opts: MarketingConsentHandlerOptions = {},
) => [
  bind(protocols.status, marketingConsentStatus(protocols.status, opts)),
  bind(protocols.save, saveMarketingConsent(protocols.save, opts)),
  bind(protocols.terms, recordTermsAcceptance(protocols.terms, opts)),
]
