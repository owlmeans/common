import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import { MARKETING_CONSENT_CLIENT_SERVICE } from './consts.js'
import { termsRecorder } from './landing.js'
import { appendMarketingConsentClient } from './service.js'
import type { MarketingConsentClientService, MarketingConsentAppendOptions } from './types.js'
import { marketingConsentStep } from './step.js'

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
