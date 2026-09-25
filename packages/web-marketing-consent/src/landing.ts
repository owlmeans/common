import { resolveTerms, termsAccepted, termsAcceptanceOf, termsDeferred } from '@owlmeans/client-auth/login'
import type { LoginLandingHook } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { MARKETING_CONSENT_LANDING_HOOK_TERMS } from './consts.js'
import type { MarketingConsentClientService } from './service.js'

/**
 * Records a fresh terms acceptance once a sign-in lands, mirroring server-side the acceptance
 * `@owlmeans/client-auth`'s own sign-in screen already confirmed locally (`termsAccepted`,
 * `localStorage`) before the flow was ever allowed to start. A config with terms disabled, or a
 * person who has not (yet) locally accepted, records nothing.
 *
 * No-ops once `termsDeferred(ctx)` is true: the confirmation lives on the marketing-consent step
 * in that mode, and recording it — with the server's own evidence, not a browser-only marker — is
 * that step's job, not this hook's. Reads `ctx.cfg` fresh on every landing rather than a value
 * captured once at `appendMarketingConsent` time, because `apiConfigMiddleware` can still be
 * merging the terms configuration in when this hook is registered.
 */
export const termsRecorder = (
  client: MarketingConsentClientService,
  locale?: string,
): LoginLandingHook => ({
  alias: MARKETING_CONSENT_LANDING_HOOK_TERMS,
  priority: 100,
  landed: async ctx => {
    if (termsDeferred(ctx)) {
      return
    }

    const resolved = resolveTerms((ctx.cfg as CommonConfig).security?.auth?.login?.terms)
    if (resolved == null || !resolved.required || !termsAccepted(resolved)) {
      return
    }

    await client.recordTerms(termsAcceptanceOf(resolved, locale))
  },
})
