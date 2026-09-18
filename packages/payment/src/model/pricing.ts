import type { JSONSchemaType } from 'ajv'
import { schema } from '@owlmeans/entrypoint'
import type { AmountCheckoutPolicy, QuantityCheckoutPolicy } from '../types.js'

export const AmountCheckoutPolicySchema = schema<AmountCheckoutPolicy>({
  type: 'object',
  properties: {
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    minimumMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    maximumMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    defaultMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    presetsMinor: {
      type: 'array', items: { type: 'number', minimum: 0, multipleOf: 1 }, uniqueItems: true,
    },
    fixedMinor: { type: 'number', minimum: 0, multipleOf: 1 },
    rateBps: { type: 'number', minimum: 0, maximum: 9999, multipleOf: 1 },
  },
  required: [
    'currency', 'minimumMinor', 'maximumMinor', 'defaultMinor', 'presetsMinor',
    'fixedMinor', 'rateBps',
  ],
  additionalProperties: false,
} as JSONSchemaType<AmountCheckoutPolicy>)

export const QuantityCheckoutPolicySchema = schema<QuantityCheckoutPolicy>({
  type: 'object',
  properties: {
    minimum: { type: 'number', minimum: 1, multipleOf: 1 },
    maximum: { type: 'number', minimum: 1, multipleOf: 1 },
    default: { type: 'number', minimum: 1, multipleOf: 1 },
  },
  required: ['minimum', 'maximum', 'default'],
  additionalProperties: false,
} as JSONSchemaType<QuantityCheckoutPolicy>)
