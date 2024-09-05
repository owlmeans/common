import type { AnySchema, JSONSchemaType } from 'ajv'
import type { Document } from 'mongodb'

export const schemaToMongoSchema = (schema: AnySchema): Document => {
  const _schema = schema as JSONSchemaType<unknown>

  if (_schema.type !== 'object') {
    throw new SyntaxError('Only object schemas can be converted to mongo schema')
  }

  const mongoSchems: Document = {
    bsonType: 'object',
    properties: _schema.properties != null
      ? 'allOf' in _schema.properties
        ? covertAllOfProperties(_schema.properties.allOf) :
        convertProperties(_schema.properties ?? {})
      : undefined,
    additionalProperties:
      _schema.additionalProperties != null
        ? convertAdditionalProperties(_schema.additionalProperties)
        : false,
    ...(_schema.required != null ? { required: _schema.required } : {}),
  }

  if ("properties" in mongoSchems && mongoSchems.properties == null) {
    delete mongoSchems.properties
  }

  if ("required" in mongoSchems && mongoSchems.required == null
    || Array.isArray(mongoSchems.required) && mongoSchems.required.length === 0) {
    delete mongoSchems.required
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

const prepareScalarType = (value: JSONSchemaType<unknown>): string | string[] => {
  const type = (Array.isArray(value.type) ? value.type : [value.type])
    .map(type => type === 'boolean' ? 'bool' : type)
  if (value.nullable) {
    type.push('null')
  }

  return type.length === 1 ? type[0] : type
}

const convertToBsonType = (value: JSONSchemaType<unknown>): Document => {
  if (Array.isArray(value.type)) {
    if ('properties' in value || 'additionalProperties' in value) {
      return {
        ...schemaToMongoSchema({ ...value, type: 'object' }),
        bsonType: prepareScalarType(value)
      }
    }
    return { bsonType: prepareScalarType(value) }
  }

  return value.type === 'object'
    ? value.format === 'date-time' ? { bsonType: 'date' } : schemaToMongoSchema(value)
    : { bsonType: prepareScalarType(value) }
}
