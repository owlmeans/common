import type { LoginStep } from '@owlmeans/client-auth/login'
import { MARKETING_CONSENT_LOGIN_STEP } from './consts.js'
import type { MarketingConsentClientService } from './service.js'

/**
 * The post-sign-in step: pending while this person's marketing-consent status has anything to
 * collect (`consentStatus`'s own `pending` — a brand-new consent, or one whose wording/mode
 * changed under them). A fetch failure fails OPEN (not pending) — a broken read must never block
 * sign-in on a screen nobody can get past.
 */
export const marketingConsentStep = (
  client: MarketingConsentClientService, entrypointAlias: string,
): LoginStep => ({
  alias: MARKETING_CONSENT_LOGIN_STEP,
  entrypoint: entrypointAlias,
  pending: async () => {
    const status = await client.status({ fresh: true })

    return status?.pending ?? false
  },
})
