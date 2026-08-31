import type { AnySchema, JSONSchemaType } from 'ajv'

/** Properties marked `secure: true` — the fields `lock()`/`unlock()` operate on by default. */
export const getSchemaSecureFeilds = (schema: AnySchema): string[] =>
  Object.entries((schema as JSONSchemaType<any>)?.properties ?? {})
    .filter(([, property]) => (property as { secure?: boolean }).secure === true)
    .map(([key]) => key)
