import type { JSONSchemaType } from 'ajv'
import type { MarketingConsentDecision, TermsDocumentRef } from '@owlmeans/marketing-consent'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord } from './types.js'

// `@owlmeans/marketing-consent`'s own `TermsDocumentRefSchema` (in its `src/schemas.ts`) is not
// exported, so the shape is re-declared here rather than imported.
const TermsDocumentRefSchema: JSONSchemaType<TermsDocumentRef> = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 128 },
    href: { type: 'string', minLength: 1, maxLength: 2048 },
    revisedAt: { type: 'string', nullable: true },
  },
  required: ['key', 'href'],
  additionalProperties: false,
}

const MarketingConsentDecisionSchema: JSONSchemaType<MarketingConsentDecision> = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 64 },
    granted: { type: 'boolean' },
    revisedAt: { type: 'string', minLength: 1 },
    mode: { type: 'string', enum: ['opt-in', 'opt-out'] },
    decidedAt: { type: 'string', minLength: 1 },
    // `'cookie'` stays valid for the rows an earlier device-to-account seeding wrote; nothing writes it now.
    source: { type: 'string', enum: ['sign-in', 'settings', 'cookie', 'api'] },
  },
  required: ['key', 'granted', 'revisedAt', 'mode', 'decidedAt', 'source'],
  additionalProperties: false,
}

/**
 * Shared with the Mongo/Postgres extension packages this schema is built for — imported by them,
 * never duplicated.
 */
export const MarketingConsentStateSchema: JSONSchemaType<MarketingConsentStateRecord> = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    subject: { type: 'string', minLength: 1 },
    userId: { type: 'string', minLength: 1 },
    profileId: { type: 'string', nullable: true },
    entityId: { type: 'string', nullable: true },
    decisions: { type: 'array', items: MarketingConsentDecisionSchema },
    terms: {
      type: 'object',
      nullable: true,
      properties: {
        documents: { type: 'array', items: TermsDocumentRefSchema },
        notices: { type: 'array', items: TermsDocumentRefSchema, nullable: true },
        version: { type: 'string', minLength: 1 },
        locale: { type: 'string', nullable: true },
        acceptedAt: { type: 'string', minLength: 1 },
      },
      required: ['documents', 'version', 'acceptedAt'],
      additionalProperties: false,
    },
    gpc: { type: 'boolean', nullable: true },
    createdAt: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', minLength: 1 },
  },
  required: ['id', 'subject', 'userId', 'decisions', 'createdAt', 'updatedAt'],
  additionalProperties: false,
}

export const MarketingConsentLogSchema: JSONSchemaType<MarketingConsentLogRecord> = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    subject: { type: 'string', minLength: 1 },
    userId: { type: 'string', minLength: 1 },
    profileId: { type: 'string', nullable: true },
    entityId: { type: 'string', nullable: true },
    kind: { type: 'string', enum: ['consent', 'terms'] },
    key: { type: 'string', nullable: true },
    granted: { type: 'boolean', nullable: true },
    revisedAt: { type: 'string', nullable: true },
    mode: { type: 'string', enum: ['opt-in', 'opt-out'], nullable: true },
    documents: { type: 'array', items: TermsDocumentRefSchema, nullable: true },
    notices: { type: 'array', items: TermsDocumentRefSchema, nullable: true },
    version: { type: 'string', nullable: true },
    decidedAt: { type: 'string', minLength: 1 },
    source: { type: 'string', enum: ['sign-in', 'settings', 'cookie', 'api'] },
    locale: { type: 'string', nullable: true },
    gpc: { type: 'boolean', nullable: true },
  },
  required: ['id', 'subject', 'userId', 'kind', 'decidedAt', 'source'],
  additionalProperties: false,
}
