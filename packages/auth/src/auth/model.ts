import type { JSONSchemaType } from 'ajv'
import type { AuthPayload, AuthToken, Authorization, ProfilePayload } from '../types.js'
import { EntityValueSchema, EnumValueSchema, GroupValueSchema, IdValueSchema, ScopeValueSchema, TypeNameSchema } from '../consts.js'
import { AttributeSchema, PermissionSchema } from '../permission/model.js'

export const AuthorizationSchema: JSONSchemaType<Authorization> = {
  type: 'object',
  properties: {
    entityId: { ...EntityValueSchema, nullable: true },
    scopes: { type: 'array', items: ScopeValueSchema },
    permissions: { type: 'array', nullable: true, items: PermissionSchema },
    attributes: { type: 'array', nullable: true, items: AttributeSchema },
    permissioned: { type: 'boolean', nullable: true },
    denormalized: { type: 'boolean', nullable: true }
  },
  required: ['scopes']
}

export const ProfilePayloadSchema: JSONSchemaType<ProfilePayload> = {
  type: 'object',
  allOf: [
    {
      type: 'object',
      properties: {
        groups: { type: 'array', nullable: true, items: GroupValueSchema }
      },
    },
    AuthorizationSchema
  ],
  required: ['scopes']
}

export const AuthPayloadSchema: JSONSchemaType<AuthPayload> = {
  type: 'object',
  allOf: [
    {
      type: 'object',
      properties: {
        type: TypeNameSchema,
        role: EnumValueSchema,
        source: { type: 'string', minLength: 1, maxLength: 1024, nullable: true },
        userId: { ...IdValueSchema, nullable: true },
        profileId: { ...IdValueSchema, nullable: true },
        expiresAt: { type: 'string', nullable: true }
      }
    },
    ProfilePayloadSchema
  ],
  required: ['scopes', 'role']
}

export const AuthTokenSchema: JSONSchemaType<AuthToken> = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 32, maxLength: 1024 },
  },
  required: ['token']
}
