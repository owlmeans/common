import type { JSONSchemaType } from 'ajv'

export const DEFAULT_TRANSCRIPT_CHARS = 24_000

export const COMPACTION_SCHEMA: JSONSchemaType<{ summary: string, advice: string }> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    advice: { type: 'string' },
  },
  required: ['summary', 'advice'],
  additionalProperties: false,
}
