import type { JSONSchemaType } from 'ajv'
import type { RelyToken } from './types.js'

export const RelyChallengeSchema: JSONSchemaType<RelyToken> = {
  type: 'object',
  properties: {
    pin: { type: 'string', nullable: true, minLength: 4, maxLength: 12 },
    token: { type: 'string', nullable: true, minLength: 8, maxLength: 16 },
    check: { type: 'string', nullable: true, minLength: 2, maxLength: 8 },
    nonce: { type: 'string', minLength: 8, maxLength: 32 }
  },
  required: ['nonce'],
  additionalProperties: false,
}
