import type { CommonConfig, LoginTermsConfig } from '@owlmeans/config'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import type {
  MarketingConsentBridge, MarketingConsentConfig, MarketingConsentEntrypoints,
} from '@owlmeans/marketing-consent'
import { cookieConsentBridge } from './bridge.js'
import { MARKETING_CONSENT_CLIENT_SERVICE } from './consts.js'
import { landingSync, termsRecorder } from './landing.js'
import { appendMarketingConsentClient } from './service.js'
import type { MarketingConsentClientService } from './service.js'
import { marketingConsentStep } from './step.js'

export interface MarketingConsentAppendOptions {
  /** From `makeMarketingConsentProtocols(...)` — the app builds this once and shares it between
   * this call and its own server-side `serveMarketingConsentEntrypoints`/`bindAll` wiring. */
  protocols: MarketingConsentEntrypoints
  /**
   * Accepted for API symmetry with the server side (`appendMarketingConsentService({ config })`),
   * but not read here: `resolveMarketingConsents` only ever runs where the catalogue is actually
   * enumerated — the server. This package's own UI reads the ALREADY-RESOLVED definitions back off
   * `MarketingConsentStatusItem.definition` and never re-resolves the catalogue client-side.
   */
  config?: MarketingConsentConfig
  /** Register the post-sign-in step. Default `true`. */
  step?: boolean
  /** Record a fresh terms acceptance on landing. Default `true`. */
  terms?: boolean
  /** Default `[cookieConsentBridge()]`. */
  bridges?: MarketingConsentBridge[]
  /** Entrypoint alias of a host's own "Privacy choices" settings screen, for
   * `MarketingConsentClientService.preferences()`. */
  preferences?: string
  locale?: string
}

/**
 * Wire the marketing-consent client into a web app: the client service, the post-sign-in step
 * (pending while anything is unanswered) and the two landing hooks (terms acceptance, then
 * cookie/account reconciliation) — the whole of what an application calls beyond registering
 * `marketingConsentEntrypoints(protocols)` in its own entrypoint list.
 */
export const appendMarketingConsent = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T, opts: MarketingConsentAppendOptions,
): T => {
  const bridges = opts.bridges ?? [cookieConsentBridge()]

  appendMarketingConsentClient(context, opts.protocols, { bridges, preferences: opts.preferences })
  const client = context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)

  const login = ensureLoginService(context)
  if (opts.step !== false) {
    login.registerStep(marketingConsentStep(client, opts.protocols.screen.alias))
  }
  if (opts.terms !== false) {
    const terms: LoginTermsConfig | undefined = (context.cfg as CommonConfig).security?.auth?.login?.terms
    login.onLanded(termsRecorder(terms, client, opts.locale))
  }
  login.onLanded(landingSync(client))

  return context
}
