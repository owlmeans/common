import type { JSONSchemaType } from 'ajv'
import type { Product } from '../types.js'
import {
  LocalizationLngSchema, ProductDescriptionSchema, ProductTitleSchema, ProductTypeSchema
} from '../consts.js'
import { ResourceValueSchema, PermissionSetSchema } from '@owlmeans/auth'

export const ProductSchema: JSONSchemaType<Product> = {
  type: 'object',
  properties: {
    type: ProductTypeSchema,
    sku: ResourceValueSchema,
    title: ProductTitleSchema,
    description: { ...ProductDescriptionSchema, nullable: true },
    defaultLng: { ...LocalizationLngSchema, nullable: true },
    services: { type: 'array', items: ResourceValueSchema, nullable: true },
    gateways: { type: 'array', items: ResourceValueSchema, nullable: true },
    capabilities: { type: 'array', items: PermissionSetSchema, nullable: true }
  },
  required: ['type', 'sku', 'title'],
  additionalProperties: false,
}
