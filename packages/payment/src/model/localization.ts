import type { JSONSchemaType } from 'ajv'
import type { Localization } from '../types.js'
import {
  ProductDescriptionSchema, ProductTitleSchema, PaymentEntityTypeSchema,
  LocalizationLngSchema
} from '../consts.js'
import { IdValueSchema } from '@owlmeans/auth'

export const LocalizationSchema: JSONSchemaType<Localization> = {
  type: 'object',
  properties: {
    type: PaymentEntityTypeSchema,
    sku: IdValueSchema,
    lng: LocalizationLngSchema,
    title: { ...ProductTitleSchema, nullable: true },
    description: { ...ProductDescriptionSchema, nullable: true },
    keywords: {
      type: 'object', required: [], nullable: true,
      additionalProperties: { type: 'string' }
    }
  },
  required: ['type', 'sku', 'lng'],
  additionalProperties: false,
}
