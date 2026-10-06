import { makePostgresResource } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import {
  MarketingConsentLogSchema, MarketingConsentStateSchema,
  RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE
} from '@owlmeans/server-marketing-consent'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord } from '@owlmeans/server-marketing-consent'

/**
 * One row per subject. `decisions`/`terms` compile to a single `jsonb` column each — the AJV
 * schema declares them as a nested array/object with no `pg:` override, and
 * `schemaToTableSpec`'s default rule for "any array of objects, or a nested object" is exactly
 * that: one opaque `jsonb` column, never a child table or one column per field. That is load
 * bearing here, not incidental — `decisions` holds dotted keys such as `"marketing.email"`, and
 * flattening it into columns or a keyed jsonb path would make that key readable as a PATH by
 * Postgres' own jsonb operators (see `@owlmeans/server-marketing-consent`'s `model.ts`). This
 * maker never reshapes the record; it only imports the schema and adds the indexes below.
 */
export const makeMarketingConsentStatePostgres = (
  dbAlias?: string, serviceAlias?: string
): PostgresResource<MarketingConsentStateRecord> => {
  const resource = makePostgresResource<MarketingConsentStateRecord>(
    RES_MARKETING_CONSENT_STATE, dbAlias, serviceAlias
  )
  resource.schema = MarketingConsentStateSchema
  resource.index('idx_mc_state_subject', { columns: ['subject'], unique: true })
  resource.index('idx_mc_state_user', { columns: ['userId'] })

  return resource
}

/**
 * Append-only evidence log — same jsonb-column reasoning as the state table above applies to
 * its `documents`/`notices` properties.
 */
export const makeMarketingConsentLogPostgres = (
  dbAlias?: string, serviceAlias?: string
): PostgresResource<MarketingConsentLogRecord> => {
  const resource = makePostgresResource<MarketingConsentLogRecord>(
    RES_MARKETING_CONSENT_LOG, dbAlias, serviceAlias
  )
  resource.schema = MarketingConsentLogSchema
  resource.index('idx_mc_log_subject_key', { columns: ['subject', 'key', 'decidedAt'] })
  resource.index('idx_mc_log_user', { columns: ['userId', 'decidedAt'] })

  return resource
}
