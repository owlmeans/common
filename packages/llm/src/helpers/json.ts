/** Property names checked when a model wraps a scalar string in an object. */
const SCALAR_KEYS = ['path', 'file', 'filename', 'name', 'value', 'source']

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Recover a JSON value from message content. Some models ignore the tool they were
 * pinned to and emit the schema-shaped JSON directly as plain message content, so the
 * tool-call parse yields nothing while the content is still valid JSON. Tolerates
 * markdown fences and leading/trailing prose by falling back to the outermost
 * `{...}` / `[...]` span. Returns `null` when nothing parseable is found.
 */
export const parseJsonContent = (content: unknown): unknown => {
  let text: string
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    text = content.map(part => typeof part === 'object' && part !== null && 'text' in (part as Record<string, unknown>)
      ? String((part as Record<string, unknown>).text) : '').join('')
  } else {
    return null
  }

  text = text.trim()
  if (text === '') return null

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence != null) text = fence[1]!.trim()

  const whole = tryParse(text)
  if (whole !== undefined) return whole

  const firstObj = text.indexOf('{')
  const lastObj = text.lastIndexOf('}')
  if (firstObj >= 0 && lastObj > firstObj) {
    const parsed = tryParse(text.slice(firstObj, lastObj + 1))
    if (parsed !== undefined) return parsed
  }

  const firstArr = text.indexOf('[')
  const lastArr = text.lastIndexOf(']')
  if (firstArr >= 0 && lastArr > firstArr) {
    const parsed = tryParse(text.slice(firstArr, lastArr + 1))
    if (parsed !== undefined) return parsed
  }

  return null
}

/**
 * Reconcile a model's answer with the schema it was given, for the two mistakes models
 * make most often with tool-call arguments:
 *
 * 1. **Stringified structures** — an `array` field filled with the string `"[]"`, an
 *    `integer` field with `"7"`, a `boolean` with `"true"`. Parsed back to the declared
 *    type; on a parse failure the original value is kept so validation reports the real error.
 * 2. **Over-wrapped scalars** — a `string` field filled with `{ path: "…" }` instead of
 *    `"…"`. Unwrapped via the likely key, or via the single string property if there is
 *    exactly one.
 *
 * Walks objects and arrays, so nested occurrences are fixed too. Purely defensive: a
 * value that already matches its schema is returned untouched.
 */
export const coerceToSchema = (value: unknown, schema: unknown): unknown => {
  if (schema == null || typeof schema !== 'object') return value
  const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown }
  const type = s.type

  if (typeof value === 'string' && type != null && type !== 'string') {
    if (type === 'array' || type === 'object') {
      try {
        return coerceToSchema(JSON.parse(value), schema)
      } catch {
        return value
      }
    }
    if (type === 'integer' || type === 'number') {
      const n = Number(value)
      return Number.isNaN(n) ? value : n
    }
    if (type === 'boolean') {
      if (value === 'true') return true
      if (value === 'false') return false
      return value
    }
  }

  if (type === 'string' && value != null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of SCALAR_KEYS) {
      if (typeof obj[key] === 'string') return obj[key]
    }
    const strings = Object.values(obj).filter((v): v is string => typeof v === 'string')
    if (strings.length === 1) return strings[0]
  }

  if (type === 'object' && s.properties != null && value != null
    && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const [key, propSchema] of Object.entries(s.properties)) {
      if (key in obj) obj[key] = coerceToSchema(obj[key], propSchema)
    }
    return obj
  }

  if (type === 'array' && Array.isArray(value) && s.items != null) {
    return value.map(item => coerceToSchema(item, s.items))
  }

  return value
}
