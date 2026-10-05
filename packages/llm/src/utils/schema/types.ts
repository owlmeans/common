import type { Ajv, JSONSchemaType, ValidateFunction } from 'ajv'

/** A caller's schema split into its optional wrapper name and the schema proper, with its validator. */
export interface ResolvedSchemaValidator<T> {
  name: string | undefined
  innerSchema: JSONSchemaType<T>
  validate: ValidateFunction<T>
}

/** Reading, naming and checking the JSON schema of a structured call. */
export interface SchemaUtils {
  /**
   * Split the caller's schema into the optional wrapper `name` and the schema proper, and
   * compile a validator for the latter. A `name` means the model is expected to answer
   * `{ [name]: <object> }`; see {@link SchemaUtils.unwrapNamed}.
   */
  resolveSchemaValidator: <T>(ajv: Ajv, schema: JSONSchemaType<T>) => ResolvedSchemaValidator<T>
  /**
   * Derive a function/tool name for tool-calling structured output. Provider tool names
   * must match `^[A-Za-z0-9_-]+$`, so the schema title/name is sanitised; falls back to
   * {@link DEFAULT_TOOL_NAME} when nothing usable is present.
   */
  toToolName: (raw: string | undefined) => string
  /** Unwrap `{ [name]: value }` when the schema declared a wrapper name. */
  unwrapNamed: <T>(result: T, name: string | undefined) => T
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
  isStrictSchema: (schema: unknown) => boolean
  /**
   * One line per object PROPERTY whose name is in `hidden`, naming its JSON pointer. Only a key of a
   * `properties` map counts — a keyword in keyword position (`required: […]`) is what the schema is
   * made of, not a field the model has to answer.
   */
  hiddenPropertyNames: (schema: unknown, hidden: ReadonlySet<string>, at?: string) => string[]
}
