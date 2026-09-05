import type { JSONSchemaType } from 'ajv'

/**
 * What the surrogate login window is told about why it was opened.
 *
 * Every field is optional: the window must render something sensible when opened by hand, or by an
 * older build that knew none of these parameters. `next` carries the address to run once the
 * window is one level up, so the flow parameters the opener's URL held are forwarded rather than
 * silently dropped.
 */
export interface SurrogateQuery {
  intent?: string
  next?: string
  method?: string
}

export const SurrogateQuerySchema: JSONSchemaType<SurrogateQuery> = {
  type: 'object',
  properties: {
    intent: { type: 'string', maxLength: 32, nullable: true },
    next: { type: 'string', maxLength: 2048, nullable: true },
    method: { type: 'string', maxLength: 128, nullable: true },
  },
  additionalProperties: true,
}
