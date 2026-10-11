import { bind } from '@owlmeans/server-entrypoint'
import { marketingConsentStatus, recordTermsAcceptance, saveMarketingConsent } from './handlers/index.js'
import type { MarketingConsentHandlerOptions, MarketingConsentServedProtocols } from './types.js'

/**
 * Bind this package's handlers to a tree declared by `makeMarketingConsentProtocols` — one binding
 * per protocol that needs a server implementation. `base` and `screen` carry no handler of their
 * own (a mounting anchor and a frontend address, the same shape as `@owlmeans/oauth`'s own consent
 * screens) and are left for the application's route tree to materialize — which is why only the
 * three served protocols are required: an api tree that declares the surface without its frontend
 * `screen` passes as it is. A `base` with no `parent` still has to be bound by the application.
 */
export const serveMarketingConsentEntrypoints = (
  protocols: MarketingConsentServedProtocols, opts: MarketingConsentHandlerOptions = {},
) => [
  bind(protocols.status, marketingConsentStatus(protocols.status, opts)),
  bind(protocols.save, saveMarketingConsent(protocols.save, opts)),
  bind(protocols.terms, recordTermsAcceptance(protocols.terms, opts)),
]
