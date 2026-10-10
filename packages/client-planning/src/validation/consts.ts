/** Draft 7 vocabulary, plus AJV's $defs spelling. Other vocabularies fail closed. */
export const FIELD_SCHEMA_KEYWORDS = new Set([
  '$id', '$schema', '$ref', '$comment', '$defs', 'definitions', 'type', 'nullable', 'const', 'enum',
  'required', 'properties', 'patternProperties', 'additionalProperties', 'propertyNames',
  'minProperties', 'maxProperties', 'dependencies', 'items', 'additionalItems', 'contains',
  'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'format',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'title', 'description', 'default',
  'examples', 'readOnly', 'writeOnly', 'contentMediaType', 'contentEncoding',
])
export const FIELD_SCHEMA_MAPS = new Set(['properties', 'patternProperties', 'definitions', '$defs'])
export const FIELD_SCHEMA_ARRAYS = new Set(['allOf', 'anyOf', 'oneOf'])
export const FIELD_SCHEMA_CHILDREN = new Set([
  'additionalProperties', 'propertyNames', 'additionalItems', 'contains', 'not', 'if', 'then', 'else',
])
export const FIELD_SCHEMA_ANNOTATIONS = new Set([
  '$comment', 'title', 'description', 'default', 'examples', 'readOnly', 'writeOnly',
  'contentMediaType', 'contentEncoding',
])
export const FIELD_SCHEMA_DRAFTS = new Set([
  'http://json-schema.org/draft-07/schema', 'http://json-schema.org/draft-07/schema#',
  'https://json-schema.org/draft-07/schema', 'https://json-schema.org/draft-07/schema#',
])
/** Reserved predicates never replace cfworker's own global format definitions. */
export const FIELD_FORMAT_PREFIX = 'owlmeans-planning:'
export const MAX_FIELD_ERRORS = 64
export const MAX_FIELD_ERROR_PATH = 512
export const REQUIRED_ERROR_PREFIX = 'Instance does not have required property "'
export const REQUIRED_ERROR_SUFFIX = '".'
export const FIELD_ERROR_WRAPPERS = new Set(['properties', 'patternProperties', 'items', '$ref', 'allOf', 'if'])
export const FIELD_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  required: 'A required field is missing', type: 'The field has an invalid type',
  enum: 'Choose one of the allowed values', const: 'The field must match its fixed value',
  format: 'The field has an invalid format', pattern: 'The field does not match its required pattern',
  additionalProperties: 'This field is not allowed', additionalItems: 'This item is not allowed',
  minimum: 'The value is below its minimum', maximum: 'The value exceeds its maximum',
  exclusiveMinimum: 'The value must exceed its minimum', exclusiveMaximum: 'The value must be below its maximum',
  multipleOf: 'The value is not an allowed multiple', minLength: 'The value is too short',
  maxLength: 'The value is too long', minItems: 'There are too few items', maxItems: 'There are too many items',
  uniqueItems: 'Items must be distinct', minProperties: 'There are too few fields', maxProperties: 'There are too many fields',
}
