import type { BasicContext } from '@owlmeans/context'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from '@owlmeans/server-marketing-consent'
import { makeMarketingConsentLogMongo, makeMarketingConsentStateMongo } from './resource.js'

export interface MarketingConsentMongoOptions {
  dbAlias?: string
  serviceAlias?: string
}

/**
 * Registers the two Mongo resources `@owlmeans/server-marketing-consent`'s `MarketingConsentService`
 * resolves by alias. No-op per resource if it is already registered, the same guard
 * `@owlmeans/server-auth-identity`'s `appendAuthIdentityResources` uses for its own services — so a
 * second call (an app composing several `append*` helpers that all happen to touch this alias)
 * never re-registers or throws.
 */
export const appendMarketingConsentMongo = (
  ctx: BasicContext<any>, opts?: MarketingConsentMongoOptions
): void => {
  if (!ctx.hasResource(RES_MARKETING_CONSENT_STATE)) {
    ctx.registerResource(makeMarketingConsentStateMongo(opts?.dbAlias, opts?.serviceAlias))
  }
  if (!ctx.hasResource(RES_MARKETING_CONSENT_LOG)) {
    ctx.registerResource(makeMarketingConsentLogMongo(opts?.dbAlias, opts?.serviceAlias))
  }
}
