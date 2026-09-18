import type { JSONSchemaType } from 'ajv'
import type { PriceEstimate, PriceEstimateBody, PricingPolicy, TaxEstimate, TaxRateEstimate } from '../types.js'
import { ResourceValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'
import { CountrySchema } from '../countries.js'
import { TaxBehaviorSchema, TaxEstimateStatusSchema, TaxTypeSchema } from '../consts.js'

export const PricingPolicySchema = schema<PricingPolicy>({
  type: 'object',
  properties: {
    tax: {
      type: 'object',
      properties: {
        automatic: { type: 'boolean' },
        behavior: { ...TaxBehaviorSchema, nullable: true },
        collectTaxId: { type: 'boolean' },
        estimate: { type: 'boolean' },
        estimateTtlSeconds: { type: 'number', minimum: 1, multipleOf: 1, nullable: true },
      },
      required: ['automatic', 'collectTaxId', 'estimate'],
      additionalProperties: false,
    },
    currency: {
      type: 'object',
      properties: {
        adaptive: { type: 'boolean', nullable: true },
        estimate: { type: 'boolean' },
        estimateTtlSeconds: { type: 'number', minimum: 1, multipleOf: 1, nullable: true },
      },
      required: ['estimate'],
      additionalProperties: false,
    },
  },
  required: ['tax', 'currency'],
  additionalProperties: false,
} as JSONSchemaType<PricingPolicy>)

export const PriceEstimateBodySchema = schema<PriceEstimateBody>({
  type: 'object',
  properties: {
    planSku: { ...ResourceValueSchema, nullable: true },
    country: { ...CountrySchema, nullable: true },
  },
  required: [],
  additionalProperties: false,
} as JSONSchemaType<PriceEstimateBody>)

const TaxRateEstimateSchema: JSONSchemaType<TaxRateEstimate> = {
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

const TaxEstimateSchema: JSONSchemaType<TaxEstimate> = {
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

export const PriceEstimateSchema = schema<PriceEstimate>({
  type: 'object',
  properties: {
    country: { ...CountrySchema, nullable: true },
    source: { type: 'string', enum: ['request', 'customer'], nullable: true },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    behavior: TaxBehaviorSchema,
    tax: TaxEstimateSchema,
    local: {
      type: 'object',
      properties: {
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        exchangeRate: { type: 'number', exclusiveMinimum: 0 },
        fxFeeRate: { type: 'number', minimum: 0, nullable: true },
      },
      required: ['currency', 'exchangeRate'],
      additionalProperties: false,
      nullable: true,
    },
  },
  required: ['currency', 'behavior', 'tax'],
  additionalProperties: false,
} as JSONSchemaType<PriceEstimate>)
