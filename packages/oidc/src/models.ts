import type { JSONSchemaType } from 'ajv'
import type { OIDCAuthInitParams, OIDCClientAuthPayload, OIDCTokenUpdate, ProviderProfileDetails } from './types.js'
import { AuthTokenSchema, EntityValueSchema, IdValueSchema, ScopeValueSchema, TypeNameSchema } from '@owlmeans/auth'

export const OIDCAuthInitParamsSchema: JSONSchemaType<OIDCAuthInitParams> = {
  type: 'object',
  properties: {
    entity: { ...EntityValueSchema, nullable: true },
    profile: { ...IdValueSchema, nullable: true },
  },
  required: []
}

export const OIDCClientAuthPayloadSchema: JSONSchemaType<OIDCClientAuthPayload> = {
  type: 'object',
  properties: {
    code: { type: 'string', minLength: 16, maxLength: 512 },
    authUrl: { type: 'string', minLength: 0, maxLength: 1024, format: 'uri' },
  },
  additionalProperties: {type: 'string', minLength: 0, maxLength: 512},
  required: ['code', 'authUrl']
}

export const OIDCTokenUpdateSchema: JSONSchemaType<OIDCTokenUpdate> = {
  type: 'object',
  properties: {
    ...AuthTokenSchema.properties,
    tokenSet: {
      type: 'object',
      properties: {
        access_token: { type: 'string', nullable: true },
        token_type: { type: 'string', nullable: true },
        id_token: { type: 'string', nullable: true },
        refresh_token: { type: 'string', nullable: true },
        scope: { type: 'string', nullable: true },
        expires_at: { type: 'number', nullable: true },
        session_state: { type: 'string', nullable: true }
      },
      required: [],
      additionalProperties: true,
    }
  },
  required: ['token', 'tokenSet'],
  additionalProperties: false
}

export const ProviderProfileDetailsSchema: JSONSchemaType<ProviderProfileDetails> = {
  type: 'object',
  properties: {
    type: { ...TypeNameSchema },
    clientId: { ...ScopeValueSchema },
    userId: { ...IdValueSchema },
    username: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
    entityId: { ...EntityValueSchema, nullable: true },
    did: { ...IdValueSchema, nullable: true },
    isOwlMeansId: { type: 'boolean', nullable: true }
  },
  required: ['type', 'clientId', 'userId'],
  additionalProperties: false
}
