import { MARKETING_CONSENT_SERVICE, type MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import type { MarketingConsentContext, MarketingConsentHandlerOptions, MarketingConsentService } from '../types.js'
import { marketingConsentSubjectHelper } from '../subject.js'

const serviceOf = (context: MarketingConsentContext, opts?: MarketingConsentHandlerOptions): MarketingConsentService =>
  context.service<MarketingConsentService>(opts?.serviceAlias ?? MARKETING_CONSENT_SERVICE)

export const saveMarketingConsent = (
  protocol: MarketingConsentEntrypoints['save'], opts: MarketingConsentHandlerOptions = {},
) => handlers<MarketingConsentContext>().body(protocol, async (payload, context, req) => {
  if (opts.allowAccessTokens !== true) refuseTokenAuth(req, 'marketing-consent-save')

  return serviceOf(context, opts).save(marketingConsentSubjectHelper.subjectOf(req), payload)
})
