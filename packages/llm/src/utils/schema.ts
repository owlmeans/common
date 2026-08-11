import type { Ajv, JSONSchemaType, ValidateFunction } from 'ajv'
import { DEFAULT_TOOL_NAME } from '../consts.js'

/**
 * Split the caller's schema into the optional wrapper `name` and the schema proper, and
 * compile a validator for the latter. A `name` means the model is expected to answer
 * `{ [name]: <object> }`; see {@link unwrapNamed}.
 */
export const resolveSchemaValidator = <T>(ajv: Ajv, schema: JSONSchemaType<T>): {
  name: string | undefined
  innerSchema: JSONSchemaType<T>
  validate: ValidateFunction<T>
} => {
  const { name, ...innerSchema } = schema as JSONSchemaType<T> & { name?: string }
  const validate = ajv.compile<T>(innerSchema as JSONSchemaType<T>)
  return { name, innerSchema: innerSchema as JSONSchemaType<T>, validate }
}

/**
 * Derive a function/tool name for tool-calling structured output. Provider tool names
 * must match `^[A-Za-z0-9_-]+$`, so the schema title/name is sanitised; falls back to
 * {@link DEFAULT_TOOL_NAME} when nothing usable is present.
 */
export const toToolName = (raw: string | undefined): string => {
  const cleaned = (raw ?? '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned : DEFAULT_TOOL_NAME
}

/** Unwrap `{ [name]: value }` when the schema declared a wrapper name. */
export const unwrapNamed = <T>(result: T, name: string | undefined): T => {
  if (name != null && result != null && typeof result === 'object' && name in (result as Record<string, unknown>)) {
    return (result as Record<string, unknown>)[name] as T
  }
  return result
}
