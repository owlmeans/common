import type { JSONSchemaType } from 'ajv'
import type { JobListQuery } from './types.js'

/**
 * Every field is optional: a list screen opens before it has a filter, and a caller that knows
 * nothing about jobs must still get the page it is allowed to see. `state` and `name` are left as
 * plain strings rather than enums so that a driver reporting a state this line does not know
 * narrows the list instead of failing the request.
 */
export const JobListQuerySchema: JSONSchemaType<JobListQuery> = {
  type: 'object',
  properties: {
    state: { type: 'string', maxLength: 32, nullable: true },
    name: { type: 'string', maxLength: 256, nullable: true },
    page: { type: 'integer', minimum: 0, nullable: true },
    size: { type: 'integer', minimum: 1, maximum: 200, nullable: true },
  },
  additionalProperties: true,
}
