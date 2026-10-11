import type { JSONSchemaType } from 'ajv'
import { IdValueSchema } from '@owlmeans/auth'
import type { TaxEstimate, TaxRateEstimate } from '../types.js'
import { TaxEstimateStatusSchema, TaxTypeSchema, CountrySchema, ConsumerRegion, ConsumerRegionSchema } from '../consts.js'

/**
 * The consumer-rights schemas describe the WIRE: a date is an ISO string, exactly as in
 * `model/view.ts` — a response serializer writes a `Date` through it as ISO. A browser revives the
 * dates with the `revive*` helpers before touching one.
 */
export const IsoDateSchema = { type: 'string', format: 'date-time' } as unknown as JSONSchemaType<Date>

export const MinorSchema: JSONSchemaType<number> = { type: 'number', minimum: 0, multipleOf: 1 }

export const CurrencySchema: JSONSchemaType<string> = { type: 'string', minLength: 3, maxLength: 3 }

export const VersionSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 64 }

export const KeySchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 128 }

export const UrlSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 2048 }

export const LanguageSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 2, maxLength: 16, pattern: '^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$',
}

export const NameSchema: JSONSchemaType<string> = { type: 'string', minLength: 1, maxLength: 200 }

export const EmailSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+$',
}

export const HoneypotSchema: JSONSchemaType<string> = { type: 'string', maxLength: 256 }

/** A copy variant suffix: `performance-consent.request_<context>`, `subscription-start.request_units`. */
export const ConsentContextSchema: JSONSchemaType<string> = {
  type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9-]*$',
}

export const AcknowledgedSchema = { type: 'boolean', const: true } as unknown as JSONSchemaType<true>

export const ReceiptContentSchema = {
  type: 'object', required: [], additionalProperties: { type: 'string', maxLength: 4096 },
} as unknown as JSONSchemaType<Record<string, string>>

export const declarationReceiptProperties = {
  declarationId: IdValueSchema,
  receivedAt: IsoDateSchema,
  content: ReceiptContentSchema,
  mailed: { type: 'boolean' },
}

export const TaxRateEstimateSchema: JSONSchemaType<TaxRateEstimate> = {
  type: 'object',
  properties: {
    type: TaxTypeSchema,
    percentage: { type: 'string', minLength: 1, maxLength: 16 },
    ratePpm: { type: 'number', minimum: 0, multipleOf: 1 },
    country: { ...CountrySchema, nullable: true },
    state: { type: 'string', minLength: 1, maxLength: 8, nullable: true },
  },
  required: ['type', 'percentage', 'ratePpm'],
  additionalProperties: false,
}

export const TaxEstimateSchema: JSONSchemaType<TaxEstimate> = {
  type: 'object',
  properties: {
    status: TaxEstimateStatusSchema,
    subtotalMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    taxMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    totalMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    scalable: { type: 'boolean' },
    rates: { type: 'array', items: TaxRateEstimateSchema },
  },
  required: ['status', 'subtotalMinor', 'taxMinor', 'totalMinor', 'scalable', 'rates'],
  additionalProperties: false,
}

/** A region that may be `null` on the wire — an enum admits `null` only when it lists it. */
export const NullableRegionSchema = {
  ...ConsumerRegionSchema, enum: [...ConsumerRegionSchema.enum, null], nullable: true,
} as unknown as JSONSchemaType<ConsumerRegion | null>
