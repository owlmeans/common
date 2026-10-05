import { type LoginStep, loginTermsHelper } from '@owlmeans/client-auth/login'
import type { CommonConfig } from '@owlmeans/config'
import { MARKETING_CONSENT_LOGIN_STEP } from './consts.js'
import { marketingConsentSkipOf } from './skip.js'
import type { MarketingConsentClientService, MarketingConsentStepOptions } from './types.js'

/**
 * The post-sign-in step.
 *
 * Ordinarily pending while this person's marketing-consent status has anything to collect
 * (`consentStatus`'s own `pending` — a brand-new consent, or one whose wording/mode changed under
 * them) AND this sign-in has not skipped it. A fetch failure fails OPEN here (not pending) — a
 * broken read must never block sign-in on a screen nobody can get past.
 *
 * With `confirmsTerms`, the rule is STRICT instead: also pending whenever the server's recorded
 * terms version does not match the resolved configuration, and a broken status read counts as
 * pending rather than not — the Terms confirmation moved here on purpose to be the one thing this
 * step never waves through unconfirmed. Reads the terms configuration fresh from `ctx.cfg` on every
 * call (never captured once at `appendMarketingConsent` time), because `apiConfigMiddleware` can
 * still be merging it in when this step is registered.
 */
export const marketingConsentStep = (
  client: MarketingConsentClientService, entrypointAlias: string, opts: MarketingConsentStepOptions = {},
): LoginStep => ({
  alias: MARKETING_CONSENT_LOGIN_STEP,
  entrypoint: entrypointAlias,
  confirmsTerms: opts.confirmsTerms === true,
  required: opts.confirmsTerms === true,
  pending: async ctx => {
    const status = await client.status({ fresh: true })

    if (opts.confirmsTerms === true) {
      const resolved = loginTermsHelper.resolveTerms((ctx.cfg as CommonConfig).security?.auth?.login?.terms)
      if (resolved != null && (status == null || status.terms?.version !== resolved.version)) {
        return true
      }
    }

    if (status?.pending !== true) {
      return false
    }

    return !(await marketingConsentSkipOf(ctx).isSkipped())
  },
})
