import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import type { MarketingConsentConfig, MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { MARKETING_CONSENT_CLIENT_SERVICE } from './consts.js'
import { termsRecorder } from './landing.js'
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
  /**
   * `true` (default): the sign-in screen keeps its own Terms checkbox, and this option only
   * decides whether `termsRecorder` copies a LOCAL acceptance to the server once landed.
   * `false`: no terms recording at all — an application that does not use
   * `@owlmeans/client-auth`'s terms confirmation.
   * `'step'`: the Terms confirmation moves OFF the sign-in screen onto THIS package's own
   * post-sign-in step instead — the checkbox, its recording and the version check all happen
   * there (`termsDeferred`, `@owlmeans/client-auth/login`). Requires `step !== false`; with
   * `step: false` there is no step left to confirm on, so this falls back to `true`.
   */
  terms?: boolean | 'step'
  /** Entrypoint alias of a host's own "Privacy choices" settings screen, for
   * `MarketingConsentClientService.preferences()`. */
  preferences?: string
  locale?: string
}

/**
 * Wire the marketing-consent client into a web app: the client service, the post-sign-in step
 * (pending while anything is unanswered) and the terms-acceptance landing hook — the whole of what
 * an application calls beyond registering `marketingConsentEntrypoints(protocols)` in its own
 * entrypoint list.
 *
 * Nothing here touches the device's cookie consent (`@owlmeans/consent`): the cookie dialog and
 * the decisions it carries between apps are a separate surface, and a person who already decided
 * there is never asked again by this one.
 */
export const appendMarketingConsent = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T, opts: MarketingConsentAppendOptions,
): T => {
  appendMarketingConsentClient(context, opts.protocols, { preferences: opts.preferences })
  const client = context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)

  const login = ensureLoginService(context)
  const confirmsTerms = opts.terms === 'step' && opts.step !== false
  if (opts.step !== false) {
    login.registerStep(marketingConsentStep(client, opts.protocols.screen.alias, { confirmsTerms }))
  }
  if (opts.terms !== false) {
    // Registered unconditionally (including in `'step'` mode): `termsRecorder` itself no-ops once
    // `termsDeferred(ctx)` is true, and reads the terms configuration fresh at landing time rather
    // than a value captured here — see its own docblock.
    login.onLanded(termsRecorder(client, opts.locale))
  }

  return context
}
