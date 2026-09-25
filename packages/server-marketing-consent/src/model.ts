import type { JSONSchemaType } from 'ajv'
import type { ResourceRecord } from '@owlmeans/resource'
import type {
  MarketingConsentDecision, MarketingConsentMode, MarketingConsentSource, TermsDocumentRef,
} from '@owlmeans/marketing-consent'

/**
 * One subject's saved decisions, one record per subject (`id` = `subjectKey(subject)`).
 *
 * `decisions` is an ARRAY, never an object keyed by consent key. A dotted key such as
 * `"marketing.email"` is read as a PATH by both Mongo dot-notation queries and Postgres jsonb path
 * operators — an object-keyed shape breaks the moment a second consent key is added. This is the
 * single most important shape decision in this package; the Mongo/Postgres extensions that will
 * store this record must not "flatten" it into an object for convenience.
 */
export interface MarketingConsentStateRecord extends ResourceRecord {
  id: string
  /** `subjectKey(subjectOf(req))` — see `./subject.js`. Also this record's own `id`. */
  subject: string
  userId: string
  profileId?: string
  entityId?: string
  decisions: MarketingConsentDecision[]
  terms?: {
    documents: TermsDocumentRef[]
    notices?: TermsDocumentRef[]
    version: string
    locale?: string
    acceptedAt: string
  }
  gpc?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Append-only evidence of every decision and terms acceptance ever recorded — GDPR Art. 7(1)
 * "demonstrate consent" material. Never updated or deleted, including on `purge()`: only the
 * current-state record is cleared there.
 */
export interface MarketingConsentLogRecord extends ResourceRecord {
  id: string
  subject: string
  userId: string
  profileId?: string
  entityId?: string
  kind: 'consent' | 'terms'
  /** Present when `kind === 'consent'`. */
  key?: string
  granted?: boolean
  revisedAt?: string
  mode?: MarketingConsentMode
  /** Present when `kind === 'terms'`. */
  documents?: TermsDocumentRef[]
  notices?: TermsDocumentRef[]
  version?: string
  decidedAt: string
  source: MarketingConsentSource
  locale?: string
  gpc?: boolean
}

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
