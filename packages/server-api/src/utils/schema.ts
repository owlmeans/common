import type { AnySchemaObject } from 'ajv'

/**
 * A request schema Fastify can serve: a `date-time` object becomes a `date-time` string (and loses
 * its `required` list), recursively through object properties. Mutates and returns `schema`.
 */
export const fixFormatDates = (schema: AnySchemaObject): AnySchemaObject => {
  if (schema.type === 'object') {
    if (schema.format === 'date-time') {
      schema.type = 'string'
      schema.format = 'date-time'
      if (schema.required != null) {
        delete schema.required
      }
    } else if (schema.properties != null) {
      schema.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [key, fixFormatDates(value as AnySchemaObject)])
      )
    }
  }

  return schema
}
