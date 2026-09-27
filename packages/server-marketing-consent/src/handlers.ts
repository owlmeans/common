import { MARKETING_CONSENT_SERVICE } from '@owlmeans/marketing-consent'
import type { MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import type { MarketingConsentContext, MarketingConsentService } from './service.js'
import { subjectOf } from './subject.js'

export interface MarketingConsentHandlerOptions {
  serviceAlias?: string
  /** Let an OAuth-minted access token save decisions or record terms too. Defaults to `false` —
   * `status` is never token-refused regardless of this option. */
  allowAccessTokens?: boolean
}

const serviceOf = (context: MarketingConsentContext, opts?: MarketingConsentHandlerOptions): MarketingConsentService =>
  context.service<MarketingConsentService>(opts?.serviceAlias ?? MARKETING_CONSENT_SERVICE)

/** GPC ("Sec-GPC: 1") read as a plain header — Fastify normalizes header names to lower case, and
 * a repeated header arrives as an array, so only its first value is read. */
const gpcOf = (headers: Record<string, string[] | string | undefined>): boolean => {
  const raw = headers['sec-gpc']
  return (Array.isArray(raw) ? raw[0] : raw) === '1'
}

export const marketingConsentStatus = (
  protocol: MarketingConsentEntrypoints['status'], opts: MarketingConsentHandlerOptions = {},
) => handlers<MarketingConsentContext>().request(protocol, async (req, context) =>
  serviceOf(context, opts).status(subjectOf(req), { gpc: gpcOf(req.headers ?? {}) }))

export const saveMarketingConsent = (
  protocol: MarketingConsentEntrypoints['save'], opts: MarketingConsentHandlerOptions = {},
) => handlers<MarketingConsentContext>().body(protocol, async (payload, context, req) => {
  if (opts.allowAccessTokens !== true) refuseTokenAuth(req, 'marketing-consent-save')

  return serviceOf(context, opts).save(subjectOf(req), payload)
})

export const recordTermsAcceptance = (
  protocol: MarketingConsentEntrypoints['terms'], opts: MarketingConsentHandlerOptions = {},
) => handlers<MarketingConsentContext>().body(protocol, async (payload, context, req) => {
  if (opts.allowAccessTokens !== true) refuseTokenAuth(req, 'marketing-consent-terms')

  return serviceOf(context, opts).recordTerms(subjectOf(req), payload)
})
