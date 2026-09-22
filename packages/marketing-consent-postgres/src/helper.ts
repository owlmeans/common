import type { BasicContext } from '@owlmeans/context'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from '@owlmeans/server-marketing-consent'

import { makeMarketingConsentLogPostgres, makeMarketingConsentStatePostgres } from './resource.js'

export interface MarketingConsentPostgresOptions {
  dbAlias?: string
  serviceAlias?: string
}

/**
 * Registers the two Postgres resources this package owns, once. A context that already has
 * either resource registered — a repeated call from an app that composes contexts in more than
 * one place — is left alone, which is also what keeps this idempotent across a hot reload.
 */
export const appendMarketingConsentPostgres = (
  ctx: BasicContext<any>, opts?: MarketingConsentPostgresOptions
): void => {
  if (!ctx.hasResource(RES_MARKETING_CONSENT_STATE)) {
    ctx.registerResource(makeMarketingConsentStatePostgres(opts?.dbAlias, opts?.serviceAlias))
  }
  if (!ctx.hasResource(RES_MARKETING_CONSENT_LOG)) {
    ctx.registerResource(makeMarketingConsentLogPostgres(opts?.dbAlias, opts?.serviceAlias))
  }
}
