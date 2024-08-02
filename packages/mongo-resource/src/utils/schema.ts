import type { AnySchema, JSONSchemaType } from 'ajv'
import type { Document } from 'mongodb'

export const schemaToMongoSchema = (schema: AnySchema): Document => {
  const _schema = schema as JSONSchemaType<unknown>

  if (_schema.type !== 'object') {
    throw new SyntaxError('Only object schemas can be converted to mongo schema')
  }

  const mongoSchems: Document = {
    bsonType: 'object',
    properties: 'allOf' in _schema.properties
      ? covertAllOfProperties(_schema.properties.allOf) :
      convertProperties(_schema.properties ?? {}),
    ...(_schema.required != null ? { required: _schema.required } : {}),
  }

  return mongoSchems
}

const convertProperties = (properties: Record<string, AnySchema>): Document =>
  Object.fromEntries(Object.entries(properties).map(([key, value]) => {
    if (key === 'oneOf') {
      throw new SyntaxError('We dont support schemas with oneof properties definition')
    }
    const _value = value as JSONSchemaType<unknown>
    return [key,
      _value.type === 'object'
        ? _value.format === 'date-time' ?
          { bsonType: 'date' }
          : schemaToMongoSchema(_value)
        : { bsonType: _value.type === 'boolean' ? 'bool' : _value.type }
    ]
  }))

const covertAllOfProperties = (allOf: Record<string, JSONSchemaType<unknown>>[]): Document =>
  allOf.map(schema => convertProperties(schema.properties ?? {}))
    .reduce((properties, schema) => ({ ...properties, ...schema }), {})
