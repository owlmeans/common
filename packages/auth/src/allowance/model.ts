import type { JSONSchemaType } from 'ajv'
import type { AllowanceRequest, Auth, AuthCredentials, AuthPayload } from '../types.js'
import {
  AuthRoleSchema, EntityValueSchema, GroupValueSchema, IdValueSchema, DateSchema,
  ScopeValueSchema, TypeNameSchema
} from '../consts.js'
import { AuthPayloadSchema } from '../auth/model.js'
import { AttributeSetSchema, PermissionSetSchema } from '../permission/model.js'

export const PartialAuthPayloadSchema: JSONSchemaType<Omit<Partial<AuthPayload>, "type">> = {
  type: 'object',
  properties: {
    role: { ...AuthRoleSchema, nullable: true },
    source: { type: 'string', minLength: 1, maxLength: 1024, nullable: true },
    userId: { ...IdValueSchema, nullable: true },
    profileId: { ...IdValueSchema, nullable: true },
    expiresAt: { ...DateSchema, nullable: true },
    groups: { type: 'array', items: GroupValueSchema, nullable: true },
    entityId: { ...EntityValueSchema, nullable: true },
    scopes: { type: 'array', items: ScopeValueSchema, nullable: true },
    permissions: { type: 'array', nullable: true, items: PermissionSetSchema },
    attributes: { type: 'array', nullable: true, items: AttributeSetSchema },
    permissioned: { type: 'boolean', nullable: true },
    denormalized: { type: 'boolean', nullable: true }
  },
  additionalProperties: false,
}

export const AllowanceRequestSchema: JSONSchemaType<AllowanceRequest> = {
  type: 'object',
  allOf: [
    {
      type: 'object',
      properties: {
        type: TypeNameSchema
      },
      required: ['type']
    },
    PartialAuthPayloadSchema
  ],
  required: ['type'],
  additionalProperties: false,
}
export const AuthCredentialsSchema: JSONSchemaType<AuthCredentials> = {
  type: 'object',
  allOf: [
    {
      type: 'object',
      properties: {
        challenge: { type: 'string', minLength: 32, maxLength: 1024 },
        credential: { type: 'string', minLength: 16, maxLength: 4096 },
      },
      required: ['challenge', 'credential']
    },
    AuthPayloadSchema
  ],
  required: ['type', 'challenge', 'credential', ...AuthPayloadSchema.required],
  additionalProperties: false,
}

export const AuthSchema: JSONSchemaType<Auth> = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 32, maxLength: 1024 },
    isUser: { type: 'boolean' },
    createdAt: DateSchema,
    expiresAt: { ...DateSchema, nullable: true },
    ...AuthPayloadSchema.properties,
  },
  required: [
    'token', 'isUser', 'createdAt', 'type', 'role', 'userId'
  ],
  additionalProperties: false,
}
