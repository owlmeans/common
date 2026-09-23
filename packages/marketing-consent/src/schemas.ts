import type { JSONSchemaType } from 'ajv'
import type { SaveMarketingConsentRequest, TermsAcceptance, TermsDocumentRef } from './types.js'

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

export const SaveMarketingConsentSchema: JSONSchemaType<SaveMarketingConsentRequest> = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', pattern: '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9-]*)*$', maxLength: 64 },
          granted: { type: 'boolean' },
        },
        required: ['key', 'granted'],
        additionalProperties: false,
      },
    },
    source: { type: 'string', enum: ['sign-in', 'settings', 'cookie'] },
    locale: { type: 'string', maxLength: 16, nullable: true },
    gpc: { type: 'boolean', nullable: true },
  },
  required: ['decisions', 'source'],
  additionalProperties: false,
}

export const TermsAcceptanceSchema: JSONSchemaType<TermsAcceptance> = {
  type: 'object',
  properties: {
    documents: { type: 'array', minItems: 0, maxItems: 16, items: TermsDocumentRefSchema },
    notices: { type: 'array', minItems: 0, maxItems: 16, items: TermsDocumentRefSchema, nullable: true },
    version: { type: 'string', minLength: 1, maxLength: 128 },
    locale: { type: 'string', nullable: true },
  },
  required: ['documents', 'version'],
  additionalProperties: false,
}
