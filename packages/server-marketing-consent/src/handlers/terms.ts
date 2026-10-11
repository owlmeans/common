import { MARKETING_CONSENT_SERVICE, type MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import type { MarketingConsentContext, MarketingConsentHandlerOptions, MarketingConsentService } from '../types.js'
import { marketingConsentSubjectHelper } from '../subject.js'

const serviceOf = (context: MarketingConsentContext, opts?: MarketingConsentHandlerOptions): MarketingConsentService =>
  context.service<MarketingConsentService>(opts?.serviceAlias ?? MARKETING_CONSENT_SERVICE)

export const recordTermsAcceptance = (
  protocol: MarketingConsentEntrypoints['terms'], opts: MarketingConsentHandlerOptions = {},
) => handlers<MarketingConsentContext>().body(protocol, async (payload, context, req) => {
  if (opts.allowAccessTokens !== true) refuseTokenAuth(req, 'marketing-consent-terms')

  return serviceOf(context, opts).recordTerms(marketingConsentSubjectHelper.subjectOf(req), payload)
})
