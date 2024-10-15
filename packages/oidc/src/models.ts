import type { JSONSchemaType } from 'ajv'
import type { OIDCAuthInitParams, OIDCClientAuthPayload } from './types.js'
import { EntityValueSchema, IdValueSchema } from '@owlmeans/auth'

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
    code: { type: 'string', minLength: 16, maxLength: 512 }
  },
  additionalProperties: {type: 'string', minLength: 0, maxLength: 512},
  required: ['code']
}
