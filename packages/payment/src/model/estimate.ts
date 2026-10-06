import type { JSONSchemaType } from 'ajv'
import type { PriceEstimate, PriceEstimateBody, PricingPolicy } from '../types.js'
import { ResourceValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'
import { CountrySchema, ConsumerRegionSchema, TaxBehaviorSchema } from '../consts.js'
import { TaxEstimateSchema } from './consts.local.js'

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

export const PriceEstimateSchema = schema<PriceEstimate>({
  type: 'object',
  properties: {
    country: { ...CountrySchema, nullable: true },
    source: { type: 'string', enum: ['request', 'customer', 'profile'], nullable: true },
    locked: { type: 'boolean', nullable: true },
    region: { ...ConsumerRegionSchema, nullable: true },
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
