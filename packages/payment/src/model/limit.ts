import type { JSONSchemaType } from 'ajv'
import type { LimitDeclaration, PlanCapability, PromoDeclaration } from '../types.js'
import { DateSchema, PermissionSetSchema } from '@owlmeans/auth'
import { LimitKindSchema, LimitWindowSchema } from '../consts.js'

/** A promo on a plan declaration. Dates follow the record convention (`DateSchema`). */
export const PromoDeclarationSchema: JSONSchemaType<PromoDeclaration> = {
  type: 'object',
  properties: {
    until: DateSchema,
    grandfather: { type: 'boolean', nullable: true },
  },
  required: ['until'],
  additionalProperties: false,
}

export const LimitDeclarationSchema: JSONSchemaType<LimitDeclaration> = {
  type: 'object',
  properties: {
    kind: LimitKindSchema,
    limit: { type: 'number', minimum: 0 },
    window: { ...LimitWindowSchema, nullable: true },
    unit: { type: 'string', minLength: 1, maxLength: 16, nullable: true },
    promo: { ...PromoDeclarationSchema, nullable: true },
  },
  required: ['kind', 'limit'],
  additionalProperties: false,
} as JSONSchemaType<LimitDeclaration>

export const PlanCapabilitySchema: JSONSchemaType<PlanCapability> = {
  ...PermissionSetSchema,
  properties: {
    ...PermissionSetSchema.properties,
    promo: { ...PromoDeclarationSchema, nullable: true },
  },
} as JSONSchemaType<PlanCapability>
