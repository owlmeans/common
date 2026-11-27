import type { JSONSchemaType } from 'ajv'
import { BOT_PLATFORM_ID_FORMAT, BOT_PLATFORMS_MAX } from '../consts.js'
import type { CatalogueChoice } from './types.js'

/**
 * A person's blueprint choice on the wire and in a preliminary record — closed, every key nullable
 * (absent or `null` is Auto). No `format`; the ids are checked against the deployed registry by the
 * agent, never here.
 */
export const CatalogueChoiceSchema = {
  type: 'object',
  properties: {
    stack: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    blueprint: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    case: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    botPlatforms: {
      type: 'array',
      items: { type: 'string', pattern: BOT_PLATFORM_ID_FORMAT },
      minItems: 1,
      maxItems: BOT_PLATFORMS_MAX,
      uniqueItems: true,
      nullable: true,
    },
    tenancy: {
      type: 'object',
      nullable: true,
      properties: { users: { type: 'boolean' }, operators: { type: 'boolean' } },
      required: ['users', 'operators'],
      additionalProperties: false,
    },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<CatalogueChoice>
