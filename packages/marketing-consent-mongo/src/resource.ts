import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import {
  MarketingConsentLogSchema, MarketingConsentStateSchema, RES_MARKETING_CONSENT_LOG,
  RES_MARKETING_CONSENT_STATE
} from '@owlmeans/server-marketing-consent'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord } from '@owlmeans/server-marketing-consent'
import type { AnySchema } from 'ajv'

/**
 * A stored Mongo document never carries a literal `id` field — only `_id`, which mongo-resource
 * derives `id` FROM on every read and never writes on `create()`. The shared schema's `required`
 * list is correct for `@owlmeans/server-marketing-consent`'s own AJV validation of a fully-formed
 * record (post-demarshal, where `id` is always present) — but handed to `mongo-resource` verbatim
 * as the collection's `$jsonSchema` validator, it makes EVERY `create()` fail with "Document
 * failed validation" (`missingProperties: ["id"]`), because the document actually inserted never
 * has that key. Verified against a real (embedded) MongoDB while building this package: assigning
 * `MarketingConsentStateSchema` as-is reproduces the failure, dropping `id` from `required` fixes
 * it. `properties` (and everything else) stays the exact same object `@owlmeans/
 * server-marketing-consent` exports — nothing here is duplicated, only the Mongo-specific
 * `required` list is narrowed, the same `id`-not-required shape `@owlmeans/server-payment`'s own
 * hand-written Mongo schemas already use for their records.
 */
const forMongoValidator = (schema: AnySchema): AnySchema => {
  const source = schema as { required?: string[] }
  if (source.required == null) {
    return schema
  }
  return { ...(schema as object), required: source.required.filter(field => field !== 'id') } as AnySchema
}

/**
 * One record per subject (`id` = `subjectKey(subject)`, already unique by construction), so the
 * unique index on `subject` is the collection-level backstop against a create race producing two
 * current-state rows for the same person.
 */
export const makeMarketingConsentStateMongo = (
  dbAlias?: string, serviceAlias?: string
): MongoResource<MarketingConsentStateRecord> => {
  const resource = makeMongoResource<MarketingConsentStateRecord>(
    RES_MARKETING_CONSENT_STATE, dbAlias, serviceAlias
  )
  resource.schema = forMongoValidator(MarketingConsentStateSchema)
  resource.index('idx_mc_state_subject', { subject: 1 }, { unique: true })
  resource.index('idx_mc_state_user', { userId: 1 })
  return resource
}

/**
 * Append-only evidence log. The compound index serves the one read this record shape exists
 * for — "the latest decision for this subject and key" — sorted straight off the index rather
 * than folded from a full per-subject scan.
 */
export const makeMarketingConsentLogMongo = (
  dbAlias?: string, serviceAlias?: string
): MongoResource<MarketingConsentLogRecord> => {
  const resource = makeMongoResource<MarketingConsentLogRecord>(
    RES_MARKETING_CONSENT_LOG, dbAlias, serviceAlias
  )
  resource.schema = forMongoValidator(MarketingConsentLogSchema)
  resource.index('idx_mc_log_subject_key', { subject: 1, key: 1, decidedAt: -1 })
  resource.index('idx_mc_log_user', { userId: 1, decidedAt: -1 })
  return resource
}
