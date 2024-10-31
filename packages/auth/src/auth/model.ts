import type { JSONSchemaType } from 'ajv'
import type { AuthPayload, AuthToken, Authorization, ProfilePayload } from '../types.js'
import {
  EntityValueSchema, EnumValueSchema, GroupValueSchema, IdValueSchema, DateSchema, ScopeValueSchema,
  TypeNameSchema
} from '../consts.js'
import { AttributeSetSchema, PermissionSetSchema } from '../permission/model.js'

export const AuthorizationSchema: JSONSchemaType<Authorization> = {
  type: 'object',
  properties: {
    entityId: { ...EntityValueSchema, nullable: true },
    scopes: { type: 'array', items: ScopeValueSchema },
    permissions: { type: 'array', nullable: true, items: PermissionSetSchema },
    attributes: { type: 'array', nullable: true, items: AttributeSetSchema },
    permissioned: { type: 'boolean', nullable: true },
    denormalized: { type: 'boolean', nullable: true }
  },
  required: ['scopes'],
  additionalProperties: false,
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
  required: ['scopes'],
  additionalProperties: false,
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
        expiresAt: { ...DateSchema, nullable: true },
      }
    },
    ProfilePayloadSchema
  ],
  required: ['scopes', 'role'],
  additionalProperties: false,
}

export const AuthTokenSchema: JSONSchemaType<AuthToken> = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 32, maxLength: 1024 },
  },
  required: ['token'],
  additionalProperties: false,
}

export const OptionalAuthTokenSchema: JSONSchemaType<Partial<AuthToken>> = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 32, maxLength: 1024, nullable: true },
  },
  required: [],
  additionalProperties: false,
}
