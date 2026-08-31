import type { JSONSchemaType } from 'ajv'
import type { ListResult, ResourceRecord } from './types.js'

/**
 * When a migration runs relative to the structure reconciliation a db implementation
 * performs at resource initialization.
 *
 * - `pre` — before the structure is reconciled. This is where a change reconciliation
 *   cannot express correctly belongs: renames, casts that need a `USING` expression,
 *   backfills that have to precede a `NOT NULL`. Once the migration has reshaped the
 *   structure, reconciliation observes no drift and emits nothing — the two mechanisms
 *   never fight because the migration pre-empts the reconciler.
 * - `post` — after reconciliation. For data backfills into columns reconciliation has
 *   just created.
 */
export enum MigrationStage {
  Pre = 'pre',
  Post = 'post'
}

export const createListSchema = <T extends ResourceRecord>(schema: JSONSchemaType<T>): JSONSchemaType<ListResult<T>> => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        ...schema,
        type: 'object',
        properties: {
          id: { type: 'string', nullable: true },
          ...schema.properties
        },
        ...(schema.required ? { required: [...schema.required] } : undefined),
        additionalProperties: false,
      }
    },
    pager: {
      type: 'object',
      properties: {
        sort: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'array', items: [
                  { type: 'string' },
                  { type: 'boolean', nullable: true }
                ], minItems: 1, maxItems: 2
              }
            ]
          },
          nullable: true
        },
        page: { type: 'number', nullable: true },
        size: { type: 'number', nullable: true },
        total: { type: 'number', nullable: true }
      },
      required: [],
      nullable: true,
      additionalProperties: false,
    }
  },
  required: ['items'],
  additionalProperties: false,
})
