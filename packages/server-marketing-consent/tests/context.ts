import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { AuthroizationType } from '@owlmeans/auth'
import { createStaticResource } from '@owlmeans/static-resource'
import { USER } from '@owlmeans/test-auth'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from '../src/consts.js'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord } from '../src/model.js'
import { appendMarketingConsentService } from '../src/service.js'
import type { MakeMarketingConsentServiceOptions, MarketingConsentContext } from '../src/service.js'

export const TEST_ENTITY = 'entity-1'
export const TEST_PROFILE = 'profile-1'
export const TEST_USER = USER.userId

let store = 0

/**
 * Category B: real `Resource<T>` implementations (`@owlmeans/static-resource`) stand in for a
 * Mongo/Postgres store — the same pattern `@owlmeans/server-oauth`'s own tests use for its pending
 * store. Every test gets its own store key so cases never bleed into one another.
 */
export const makeTestContext = (opts: MakeMarketingConsentServiceOptions = {}): MarketingConsentContext => {
  const key = `server-marketing-consent-tests-${++store}`
  const cfg = { ready: false, service: 'server-marketing-consent-tests', type: AppType.Backend, services: {} }
  const context = makeBasicContext(cfg) as unknown as MarketingConsentContext & BasicContext<typeof cfg>

  context.registerResource(
    createStaticResource<MarketingConsentStateRecord>(RES_MARKETING_CONSENT_STATE, `${key}-state`)
  )
  context.registerResource(
    createStaticResource<MarketingConsentLogRecord>(RES_MARKETING_CONSENT_LOG, `${key}-log`)
  )

  appendMarketingConsentService(context, opts)

  return context
}

/** An authenticated browser session — built over `@owlmeans/test-auth`'s `USER` fixture. */
export const session = (patch: Record<string, unknown> = {}): any => ({
  headers: {}, params: {}, query: {}, body: {},
  entity: { id: TEST_ENTITY, slug: TEST_ENTITY },
  auth: {
    ...USER,
    type: AuthroizationType.Ed25519BasicToken,
    profileId: TEST_PROFILE,
    userId: TEST_USER,
    entitySlug: TEST_ENTITY,
    scopes: ['*'],
    ...patch,
  },
})
