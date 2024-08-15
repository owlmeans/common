import { JSONSchemaType } from 'ajv'
import { AttributeSet, Capabilties, PermissionSet } from '../types.js'
import { AttributeValueSchema, ResourceValueSchema, ScopeValueSchema } from '../consts.js'

export const CapabiltiesSchema: JSONSchemaType<Capabilties> = {
  type: 'object',
  additionalProperties: { type: ['boolean', 'number'], nullable: true },
  required: []
}

export const PermissionSetSchema: JSONSchemaType<PermissionSet> = {
  type: 'object',
  properties: {
    scope: ScopeValueSchema,
    permissions: CapabiltiesSchema,
    resources: { type: 'array', items: ResourceValueSchema, nullable: true }
  },
  required: ['scope', 'permissions']
}

export const AttributeSchema: JSONSchemaType<AttributeSet> = {
  type: 'object',
  properties: {
    scope: ScopeValueSchema,
    attributes: { type: 'array', items: AttributeValueSchema }
  },
  required: ['scope', 'attributes']
}
