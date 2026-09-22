import { describe, expect, test } from 'bun:test'
import { MarketingConsentLogSchema, MarketingConsentStateSchema } from '@owlmeans/server-marketing-consent'
import { makeMarketingConsentLogMongo, makeMarketingConsentStateMongo } from '../src/resource.js'

/**
 * Needs no live Mongo. Proves the two makers build the collection validator FROM the shared
 * schemas in `@owlmeans/server-marketing-consent` — `properties` is the exact same object,
 * nothing is redeclared — while narrowing `required` to drop `id`, which a stored Mongo document
 * never carries (see the comment on `forMongoValidator` in `../src/resource.ts` for why: handing
 * the schema to Mongo's `$jsonSchema` validator as-is makes every `create()` fail).
 */
describe('@owlmeans/marketing-consent-mongo — schema wiring', () => {
  test('the state resource shares the state schema\'s properties and drops `id` from required', () => {
    const resource = makeMarketingConsentStateMongo()
    const schema = resource.schema as { properties: unknown, required: string[] }

    expect(schema.properties).toBe(MarketingConsentStateSchema.properties as never)
    expect(schema.required).toEqual(
      (MarketingConsentStateSchema.required as string[]).filter(field => field !== 'id')
    )
    expect(schema.required).not.toContain('id')
  })

  test('the log resource shares the log schema\'s properties and drops `id` from required', () => {
    const resource = makeMarketingConsentLogMongo()
    const schema = resource.schema as { properties: unknown, required: string[] }

    expect(schema.properties).toBe(MarketingConsentLogSchema.properties as never)
    expect(schema.required).toEqual(
      (MarketingConsentLogSchema.required as string[]).filter(field => field !== 'id')
    )
    expect(schema.required).not.toContain('id')
  })
})
