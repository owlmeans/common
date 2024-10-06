
import type { JSONSchemaType } from 'ajv'
import type { Profile } from '../types.js'
import { EntityValueSchema, IdValueSchema } from '../consts.js'
import { PermissionSetSchema, AttributeSetSchema } from '../permission/model.js'

export const ProfileSchema: JSONSchemaType<Profile> = {
  type: 'object',
  properties: {
    id: IdValueSchema,
    name: { type: 'string', minLength: 0, maxLength: 128 },
    credential: { type: 'string', nullable: true },
    secret: { type: 'string', nullable: true },
    groups: { type: 'array', items: { type: 'string' }, nullable: true },
    entityId: {...EntityValueSchema, nullable: true},
    scopes: { type: 'array', items: { type: 'string' } },
    permissions: { type: 'array', items: PermissionSetSchema, nullable: true },
    attributes: { type: 'array', items: AttributeSetSchema, nullable: true },
    permissioned: { type: 'boolean', nullable: true },
    denormalized: { type: 'boolean', nullable: true }
  },
  required: ['id', 'name', 'scopes']
}
