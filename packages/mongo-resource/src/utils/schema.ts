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
    additionalProperties:
      _schema.additionalProperties != null
        ? convertAdditionalProperties(_schema.additionalProperties)
        : false,
    ...(_schema.required != null ? { required: _schema.required } : {}),
  }

  return mongoSchems
}

const convertAdditionalProperties = (additionalProperties: boolean | AnySchema): Document | boolean => {
  if (typeof additionalProperties === 'boolean') {
    return additionalProperties
  }

  return convertToBsonType(additionalProperties as JSONSchemaType<unknown>)
}

const convertProperties = (properties: Record<string, AnySchema>): Document =>
  Object.fromEntries(Object.entries(properties).map(([key, value]) => {
    if (key === 'oneOf') {
      throw new SyntaxError('We dont support schemas with oneof properties definition')
    }
    
    return [key, convertToBsonType(value as JSONSchemaType<unknown>)]
  }))

const covertAllOfProperties = (allOf: Record<string, JSONSchemaType<unknown>>[]): Document =>
  allOf.map(schema => convertProperties(schema.properties ?? {}))
    .reduce((properties, schema) => ({ ...properties, ...schema }), {})

const convertToBsonType = (value: JSONSchemaType<unknown>): Document =>
  value.type === 'object'
    ? value.format === 'date-time' ?
      { bsonType: 'date' }
      : schemaToMongoSchema(value)
    : { bsonType: value.type === 'boolean' ? 'bool' : value.type }
