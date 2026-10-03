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

/** Keywords strict tool use compiles. Anything else — `minLength`, `pattern`, `nullable`, … — is out. */
const STRICT_KEYWORDS = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf',
  'allOf', 'default', 'description', 'title', 'format', 'minItems',
])

const STRICT_TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'])

const STRICT_FORMATS = new Set([
  'date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid',
])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/**
 * Whether a JSON schema stays inside the subset strict tool use compiles (Anthropic's
 * structured-outputs "JSON Schema limitations"): basic types, `enum` of scalars, `const`,
 * `anyOf`/`allOf`, the listed string formats, `minItems` of 0 or 1, and every object closed with
 * `additionalProperties: false`.
 *
 * Deliberately conservative — a `$ref` (recursion cannot be ruled out cheaply), a numeric or
 * string constraint, or a keyword this list does not name answers `false`, and so does a malformed
 * node. A strict schema outside the subset is a 400 no retry fixes; a non-strict one is only
 * unconstrained, and the caller's validator still checks what comes back.
 */
export const isStrictSchema = (schema: unknown): boolean => {
  if (!isPlainObject(schema)) {
    return false
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!STRICT_KEYWORDS.has(key)) {
      return false
    }
    switch (key) {
      case 'type': {
        const types = Array.isArray(value) ? value : [value]
        if (types.length === 0 || !types.every(type => typeof type === 'string' && STRICT_TYPES.has(type))) {
          return false
        }
        break
      }
      case 'properties':
        if (!isPlainObject(value) || !Object.values(value).every(isStrictSchema)) {
          return false
        }
        break
      case 'required':
        if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
          return false
        }
        break
      case 'items':
        if (!isStrictSchema(value)) {
          return false
        }
        break
      case 'anyOf':
      case 'allOf':
        if (!Array.isArray(value) || value.length === 0 || !value.every(isStrictSchema)) {
          return false
        }
        break
      case 'enum':
        if (!Array.isArray(value) || !value.every(entry => entry === null || typeof entry !== 'object')) {
          return false
        }
        break
      case 'format':
        if (typeof value !== 'string' || !STRICT_FORMATS.has(value)) {
          return false
        }
        break
      case 'additionalProperties':
        if (value !== false) {
          return false
        }
        break
      case 'minItems':
        if (value !== 0 && value !== 1) {
          return false
        }
        break
      case 'const':
        if (value !== null && typeof value === 'object') {
          return false
        }
        break
    }
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if ((types.includes('object') || schema.properties != null) && schema.additionalProperties !== false) {
    return false
  }

  return true
}

/** Every sub-schema of a node, with the JSON-pointer segment that reaches it. */
const subSchemas = (node: Record<string, unknown>): Array<[string, unknown]> => {
  const children: Array<[string, unknown]> = []
  for (const key of ['properties', '$defs', 'definitions'] as const) {
    const map = node[key]
    if (isPlainObject(map)) {
      for (const [name, child] of Object.entries(map)) children.push([`${key}/${name}`, child])
    }
  }
  for (const key of ['items', 'additionalProperties'] as const) {
    if (isPlainObject(node[key])) children.push([key, node[key]])
  }
  for (const key of ['items', 'prefixItems', 'anyOf', 'oneOf', 'allOf'] as const) {
    const list = node[key]
    if (Array.isArray(list)) list.forEach((child, index) => children.push([`${key}/${index}`, child]))
  }

  return children
}

const pointerSegment = (name: string): string => name.replace(/~/g, '~0').replace(/\//g, '~1')

/**
 * One line per object PROPERTY whose name is in `hidden`, naming its JSON pointer. Only a key of a
 * `properties` map counts — a keyword in keyword position (`required: […]`) is what the schema is
 * made of, not a field the model has to answer.
 */
export const hiddenPropertyNames = (schema: unknown, hidden: ReadonlySet<string>, at = '#'): string[] => {
  if (!isPlainObject(schema)) {
    return []
  }
  const defects: string[] = []
  if (isPlainObject(schema.properties)) {
    for (const name of Object.keys(schema.properties)) {
      if (hidden.has(name)) {
        defects.push(`${at}/properties/${pointerSegment(name)}: a property named "${name}" is not shown to the model`)
      }
    }
  }
  for (const [segment, child] of subSchemas(schema)) {
    defects.push(...hiddenPropertyNames(child, hidden, `${at}/${segment}`))
  }

  return defects
}
