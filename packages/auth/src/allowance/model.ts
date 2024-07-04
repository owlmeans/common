import type { JSONSchemaType } from 'ajv'
import type { AllowanceRequest, AuthCredentials, AuthPayload } from '../types'
import { AuthRoleSchema, EntityValueSchema, GroupValueSchema, IdValueSchema, ScopeValueSchema, TypeNameSchema } from '../consts'
import { AuthPayloadSchema } from '../auth'
import { AttributeSchema, PermissionSchema } from '../permission'

export const PartialAuthPayloadSchema: JSONSchemaType<Omit<Partial<AuthPayload>, "type">> = {
  type: 'object',
  properties: {
    role: { ...AuthRoleSchema, nullable: true },
    source: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
    userId: { ...IdValueSchema, nullable: true },
    profileId: { ...IdValueSchema, nullable: true },
    expiresAt: { type: 'string', nullable: true },
    groups: { type: 'array', items: GroupValueSchema, nullable: true },
    entityId: { ...EntityValueSchema, nullable: true },
    scopes: { type: 'array', items: ScopeValueSchema, nullable: true },
    permissions: { type: 'array', nullable: true, items: PermissionSchema },
    attributes: { type: 'array', nullable: true, items: AttributeSchema },
    permissioned: { type: 'boolean', nullable: true },
    denormalized: { type: 'boolean', nullable: true }
  }
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
  required: ['type']
}
export const AuthCredentialsSchema: JSONSchemaType<AuthCredentials> = {
  type: 'object',
  allOf: [
    {
      type: 'object',
      properties: {
        challenge: { type: 'string', minLength: 16, maxLength: 128 },
        credential: { type: 'string', minLength: 16, maxLength: 256 },
      },
      required: ['challenge', 'credential']
    },
    AuthPayloadSchema
  ],
  required: ['type', 'challenge', 'credential']
}
