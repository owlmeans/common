/** Appended to the description of a property its object requires. */
export const REQUIRED_NOTE = 'Required.'

/** Appended to the description of a `nullable` node. */
export const NULLABLE_NOTE = 'May be null.'

/** Where a constraint's own value goes in its note. */
export const NOTE_VALUE = '{value}'

/**
 * The validation keywords a non-strict OpenAI `json_schema` never shows the model, in the order their
 * notes are appended to the node's `description`. A number-valued `exclusiveMinimum`/`exclusiveMaximum`
 * only (the draft-4 boolean form qualifies `minimum`/`maximum` and is not a value).
 */
export const CONSTRAINT_NOTES: ReadonlyArray<readonly [keyword: string, note: string]> = [
  ['minLength', 'At least {value} character(s).'],
  ['maxLength', 'At most {value} character(s).'],
  ['minItems', 'At least {value} item(s).'],
  ['maxItems', 'At most {value} item(s).'],
  ['minimum', 'At least {value}.'],
  ['maximum', 'At most {value}.'],
  ['exclusiveMinimum', 'Greater than {value}.'],
  ['exclusiveMaximum', 'Less than {value}.'],
  ['pattern', 'Must match the pattern {value}.'],
  ['format', 'Format: {value}.'],
]

/** Keywords whose value is a map of name → sub-schema. */
export const SCHEMA_MAP_KEYWORDS = new Set(['properties', '$defs', 'definitions', 'patternProperties', 'dependentSchemas'])

/** Keywords whose value is a list of sub-schemas. */
export const SCHEMA_LIST_KEYWORDS = new Set(['anyOf', 'oneOf', 'allOf', 'prefixItems'])

/** Keywords whose value is one sub-schema (`items` may also be a list). */
export const SCHEMA_KEYWORDS = new Set([
  'items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems', 'not', 'if',
  'then', 'else', 'contains', 'propertyNames',
])
