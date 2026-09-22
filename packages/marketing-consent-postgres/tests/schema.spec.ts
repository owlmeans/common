import { describe, expect, test } from 'bun:test'
import { getDeclaration, resetDeclarations, schemaToTableSpec } from '@owlmeans/postgres-resource'
import {
  MarketingConsentLogSchema, MarketingConsentStateSchema,
  RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE
} from '@owlmeans/server-marketing-consent'

import { makeMarketingConsentLogPostgres, makeMarketingConsentStatePostgres } from '../src/resource.js'

/**
 * No live database needed — `schemaToTableSpec` is the same compiler `init()` runs against a
 * real connection, so this is the one test that would have caught the CRITICAL risk this
 * package exists to avoid: `decisions`/`terms` silently expanding into per-field columns or a
 * child table instead of staying one opaque `jsonb` blob each.
 */
describe('@owlmeans/marketing-consent-postgres — schema shape', () => {
  test('the maker assigns the imported schema, not a copy', () => {
    resetDeclarations(RES_MARKETING_CONSENT_STATE)
    resetDeclarations(RES_MARKETING_CONSENT_LOG)

    const state = makeMarketingConsentStatePostgres()
    const log = makeMarketingConsentLogPostgres()

    expect(state.schema).toBe(MarketingConsentStateSchema)
    expect(log.schema).toBe(MarketingConsentLogSchema)
  })

  test('decisions and terms compile to one jsonb column each, never a child table', () => {
    const spec = schemaToTableSpec(
      RES_MARKETING_CONSENT_STATE, MarketingConsentStateSchema, 'app', 'marketing_consent_state', true
    )

    const decisions = spec.byProperty.decisions
    const terms = spec.byProperty.terms

    expect(decisions.jsonb).toBe(true)
    expect(decisions.sqlType).toBe('jsonb')
    /** Not a native Postgres array column — the whole array is one opaque jsonb value. */
    expect(decisions.array).toBe(false)

    expect(terms.jsonb).toBe(true)
    expect(terms.sqlType).toBe('jsonb')
    expect(terms.array).toBe(false)

    /** Exactly the schema's own top-level properties — nothing expanded into extra columns. */
    expect(spec.columns.map(column => column.property).sort()).toEqual([
      'createdAt', 'decisions', 'entityId', 'gpc', 'id', 'profileId', 'subject', 'terms',
      'updatedAt', 'userId'
    ])
  })

  test('the log table\'s documents/notices are also single jsonb columns', () => {
    const spec = schemaToTableSpec(
      RES_MARKETING_CONSENT_LOG, MarketingConsentLogSchema, 'app', 'marketing_consent_log', true
    )

    expect(spec.byProperty.documents.jsonb).toBe(true)
    expect(spec.byProperty.documents.array).toBe(false)
    expect(spec.byProperty.notices.jsonb).toBe(true)
    expect(spec.byProperty.notices.array).toBe(false)
  })

  test('the makers declare the indexes the API sketch promises', () => {
    resetDeclarations(RES_MARKETING_CONSENT_STATE)
    resetDeclarations(RES_MARKETING_CONSENT_LOG)
    makeMarketingConsentStatePostgres()
    makeMarketingConsentLogPostgres()

    const stateIndexes = getDeclaration(RES_MARKETING_CONSENT_STATE).indexes
    expect(stateIndexes).toContainEqual(
      expect.objectContaining({ name: 'idx_mc_state_subject', columns: ['subject'], unique: true })
    )
    expect(stateIndexes).toContainEqual(
      expect.objectContaining({ name: 'idx_mc_state_user', columns: ['userId'] })
    )

    const logIndexes = getDeclaration(RES_MARKETING_CONSENT_LOG).indexes
    expect(logIndexes).toContainEqual(
      expect.objectContaining({ name: 'idx_mc_log_subject_key', columns: ['subject', 'key', 'decidedAt'] })
    )
    expect(logIndexes).toContainEqual(
      expect.objectContaining({ name: 'idx_mc_log_user', columns: ['userId', 'decidedAt'] })
    )
  })
})
