import type { JSONSchemaType } from 'ajv'
import { AUTH_TOKEN_MAX_TTL, AUTH_TOKEN_NAME_MAX } from './consts.js'
import type { AccessTokenParams, CreateAccessToken } from './types.js'

export const CreateAccessTokenSchema: JSONSchemaType<CreateAccessToken> = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: AUTH_TOKEN_NAME_MAX },
    scopes: {
      type: 'array',
      nullable: true,
      maxItems: 32,
      items: { type: 'string', minLength: 1, maxLength: 128 },
    },
    expiresIn: {
      type: 'integer',
      nullable: true,
      minimum: 60,
      maximum: Math.floor(AUTH_TOKEN_MAX_TTL / 1000),
    },
  },
  required: ['name'],
  additionalProperties: false,
}

export const AccessTokenParamsSchema: JSONSchemaType<AccessTokenParams> = {
  type: 'object',
  properties: { id: { type: 'string', minLength: 1, maxLength: 128 } },
  required: ['id'],
  additionalProperties: false,
}
