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

/**
 * The JSON Schema draft-07 meta-schema a field schema is checked against — ajv's own
 * `refs/json-schema-draft-07.json`, kept here as data. Importing that file directly needs a JSON
 * import attribute in Node, and a bundler that also meets ajv's own attribute-less `require` of the
 * same file refuses the two (Rollup: "import attributes for the same module are always consistent").
 */
export const JSON_SCHEMA_DRAFT_07: Readonly<Record<string, unknown>> = Object.freeze({
  '$schema': 'http://json-schema.org/draft-07/schema#',
  '$id': 'http://json-schema.org/draft-07/schema#',
  'title': 'Core schema meta-schema',
  'definitions': {
    'schemaArray': {
      'type': 'array',
      'minItems': 1,
      'items': {
        '$ref': '#'
      }
    },
    'nonNegativeInteger': {
      'type': 'integer',
      'minimum': 0
    },
    'nonNegativeIntegerDefault0': {
      'allOf': [
        {
          '$ref': '#/definitions/nonNegativeInteger'
        },
        {
          'default': 0
        }
      ]
    },
    'simpleTypes': {
      'enum': [
        'array',
        'boolean',
        'integer',
        'null',
        'number',
        'object',
        'string'
      ]
    },
    'stringArray': {
      'type': 'array',
      'items': {
        'type': 'string'
      },
      'uniqueItems': true,
      'default': []
    }
  },
  'type': [
    'object',
    'boolean'
  ],
  'properties': {
    '$id': {
      'type': 'string',
      'format': 'uri-reference'
    },
    '$schema': {
      'type': 'string',
      'format': 'uri'
    },
    '$ref': {
      'type': 'string',
      'format': 'uri-reference'
    },
    '$comment': {
      'type': 'string'
    },
    'title': {
      'type': 'string'
    },
    'description': {
      'type': 'string'
    },
    'default': true,
    'readOnly': {
      'type': 'boolean',
      'default': false
    },
    'examples': {
      'type': 'array',
      'items': true
    },
    'multipleOf': {
      'type': 'number',
      'exclusiveMinimum': 0
    },
    'maximum': {
      'type': 'number'
    },
    'exclusiveMaximum': {
      'type': 'number'
    },
    'minimum': {
      'type': 'number'
    },
    'exclusiveMinimum': {
      'type': 'number'
    },
    'maxLength': {
      '$ref': '#/definitions/nonNegativeInteger'
    },
    'minLength': {
      '$ref': '#/definitions/nonNegativeIntegerDefault0'
    },
    'pattern': {
      'type': 'string',
      'format': 'regex'
    },
    'additionalItems': {
      '$ref': '#'
    },
    'items': {
      'anyOf': [
        {
          '$ref': '#'
        },
        {
          '$ref': '#/definitions/schemaArray'
        }
      ],
      'default': true
    },
    'maxItems': {
      '$ref': '#/definitions/nonNegativeInteger'
    },
    'minItems': {
      '$ref': '#/definitions/nonNegativeIntegerDefault0'
    },
    'uniqueItems': {
      'type': 'boolean',
      'default': false
    },
    'contains': {
      '$ref': '#'
    },
    'maxProperties': {
      '$ref': '#/definitions/nonNegativeInteger'
    },
    'minProperties': {
      '$ref': '#/definitions/nonNegativeIntegerDefault0'
    },
    'required': {
      '$ref': '#/definitions/stringArray'
    },
    'additionalProperties': {
      '$ref': '#'
    },
    'definitions': {
      'type': 'object',
      'additionalProperties': {
        '$ref': '#'
      },
      'default': {}
    },
    'properties': {
      'type': 'object',
      'additionalProperties': {
        '$ref': '#'
      },
      'default': {}
    },
    'patternProperties': {
      'type': 'object',
      'additionalProperties': {
        '$ref': '#'
      },
      'propertyNames': {
        'format': 'regex'
      },
      'default': {}
    },
    'dependencies': {
      'type': 'object',
      'additionalProperties': {
        'anyOf': [
          {
            '$ref': '#'
          },
          {
            '$ref': '#/definitions/stringArray'
          }
        ]
      }
    },
    'propertyNames': {
      '$ref': '#'
    },
    'const': true,
    'enum': {
      'type': 'array',
      'items': true,
      'minItems': 1,
      'uniqueItems': true
    },
    'type': {
      'anyOf': [
        {
          '$ref': '#/definitions/simpleTypes'
        },
        {
          'type': 'array',
          'items': {
            '$ref': '#/definitions/simpleTypes'
          },
          'minItems': 1,
          'uniqueItems': true
        }
      ]
    },
    'format': {
      'type': 'string'
    },
    'contentMediaType': {
      'type': 'string'
    },
    'contentEncoding': {
      'type': 'string'
    },
    'if': {
      '$ref': '#'
    },
    'then': {
      '$ref': '#'
    },
    'else': {
      '$ref': '#'
    },
    'allOf': {
      '$ref': '#/definitions/schemaArray'
    },
    'anyOf': {
      '$ref': '#/definitions/schemaArray'
    },
    'oneOf': {
      '$ref': '#/definitions/schemaArray'
    },
    'not': {
      '$ref': '#'
    }
  },
  'default': true
})
