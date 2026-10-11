import { MARKETING_CONSENT_SERVICE, type MarketingConsentEntrypoints } from '@owlmeans/marketing-consent'
import { handlers } from '@owlmeans/server-api'
import type { MarketingConsentContext, MarketingConsentHandlerOptions, MarketingConsentService } from '../types.js'
import { marketingConsentSubjectHelper } from '../subject.js'

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
  serviceOf(context, opts).status(marketingConsentSubjectHelper.subjectOf(req), { gpc: gpcOf(req.headers ?? {}) }))
