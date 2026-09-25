import type { JSONSchemaType } from 'ajv'
import { INTENT_PROMPT_MAX, INTENT_REF_LENGTH, INTENT_REF_PATTERN } from './consts.js'
import type { IntentPickupBody, IntentStashBody } from './types.js'

/**
 * The stash body. `consent` is a constant `true`, not a boolean: the data-processing confirmation is
 * a precondition of the request existing, so the wire refuses its absence instead of the handler
 * having to remember to look.
 */
export const IntentStashBodySchema: JSONSchemaType<IntentStashBody> = {
  type: 'object',
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: INTENT_PROMPT_MAX },
    consent: { type: 'boolean', const: true },
  },
  required: ['prompt', 'consent'],
  additionalProperties: false,
}

export const IntentPickupBodySchema: JSONSchemaType<IntentPickupBody> = {
  type: 'object',
  properties: {
    ref: { type: 'string', minLength: INTENT_REF_LENGTH, maxLength: INTENT_REF_LENGTH, pattern: INTENT_REF_PATTERN },
  },
  required: ['ref'],
  additionalProperties: false,
}
