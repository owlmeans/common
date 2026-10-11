import type { AnySchema } from 'ajv'
import type { Document } from 'mongodb'

import type { MongoReference } from '../../types.js'

/** An AJV schema as the `$jsonSchema` validator of a collection. */
export interface MongoSchemaUtils {
  /**
   * Declared references are stored as `ObjectId`s while the AJV schema — which describes
   * the records the app exchanges — keeps calling them strings. The collection validator
   * describes what's stored, so the reference fields are overridden here after the plain
   * conversion. Nullability and array shape carry over from the declared property.
   */
  applyReferenceTypes: (mongoSchema: Document, schema: AnySchema, refs: MongoReference[]) => Document
  /** The plain conversion of an object schema into a `$jsonSchema` document. */
  schemaToMongoSchema: (schema: AnySchema) => Document
}
