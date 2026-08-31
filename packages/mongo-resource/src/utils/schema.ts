import type { AnySchema, JSONSchemaType } from 'ajv'
import type { Document } from 'mongodb'

import type { MongoReference } from '../types.js'

/**
 * Declared references are stored as `ObjectId`s while the AJV schema — which describes
 * the records the app exchanges — keeps calling them strings. The collection validator
 * describes what's stored, so the reference fields are overridden here after the plain
 * conversion. Nullability and array shape carry over from the declared property.
 */
export const applyReferenceTypes = (
  mongoSchema: Document, schema: AnySchema, refs: MongoReference[]
): Document => {
  if (mongoSchema.properties == null || refs.length < 1) {
    return mongoSchema
  }
  const properties: Record<string, JSONSchemaType<unknown>> =
    (schema as JSONSchemaType<unknown>).properties ?? {}
  for (const ref of refs) {
    const declared = properties[ref.field]
    if (declared == null || mongoSchema.properties[ref.field] == null) {
      continue
    }
    mongoSchema.properties[ref.field] = declared.type === 'array'
      ? {
        bsonType: declared.nullable ? ['array', 'null'] : 'array',
        items: { bsonType: 'objectId' }
      }
      : { bsonType: declared.nullable ? ['objectId', 'null'] : 'objectId' }
  }

  return mongoSchema
}

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

  if (_schema.nullable) {
    mongoSchems.bsonType = [mongoSchems.bsonType, 'null']
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
    // `DateSchema` is `{ type: 'object', format: 'date-time' }`, so a date is detected by
    // format rather than type — but it still has to honor `nullable`, otherwise an optional
    // date left unset (the driver writes `undefined` as `null`) fails collection validation.
    ? value.format === 'date-time' ? { bsonType: value.nullable ? ['date', 'null'] : 'date' } : schemaToMongoSchema(value)
    : { bsonType: prepareScalarType(value) }
}
