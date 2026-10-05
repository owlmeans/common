/** Keywords strict tool use compiles. Anything else — `minLength`, `pattern`, `nullable`, … — is out. */
export const STRICT_KEYWORDS = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf',
  'allOf', 'default', 'description', 'title', 'format', 'minItems',
])

export const STRICT_TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'])

export const STRICT_FORMATS = new Set([
  'date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid',
])
