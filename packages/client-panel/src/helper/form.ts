
import type { AnySchema, JSONSchemaType } from 'ajv'

export const schemaToFormDefault = (schema: AnySchema): Record<string, any> => {
  const _schema: JSONSchemaType<unknown> = schema as JSONSchemaType<unknown>
  return Object.fromEntries(Object.entries(_schema.properties).map(([key, value]) => [key, (value as any).default ?? '']))
}
