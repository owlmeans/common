import { JSONSchemaType } from 'ajv'
import { Attribute, Permission } from '../types.js'
import { AttributeValueSchema, PermissionValueSchema, ResourceValueSchema, ScopeValueSchema } from '../consts.js'

export const PermissionSchema: JSONSchemaType<Permission> = {
  type: 'object',
  properties: {
    scope: ScopeValueSchema,
    permissions: { type: 'array', items: PermissionValueSchema },
    resources: {type: 'array', items: ResourceValueSchema}
  },
  required: ['scope', 'permissions']
}

export const AttributeSchema: JSONSchemaType<Attribute> = {
  type: 'object',
  properties: {
    scope: ScopeValueSchema,
    attributes: { type: 'array', items: AttributeValueSchema }
  },
  required: ['scope', 'attributes']
}
