import type { DbConfig, ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '../types.js'
import type { Db, Collection, Document } from 'mongodb'
import { mongoCollectionName } from './name.js'
import { schemaToMongoSchema } from './schema.js'
import { updateIndexes } from './indexes.js'

export const initializeCollection = async (
  db: Db, config: DbConfig, resource: MongoResource<ResourceRecord>
): Promise<Collection> => {
  let _collection: Collection

  const name = mongoCollectionName(config, resource)
  const cursor = db.listCollections({ name })
  if (!await cursor.hasNext()) {
    _collection = await createCollection(db, name, resource)
  } else {
    _collection = await updateCollection(db, name, resource)
  }

  return _collection
}

export const createCollection = async (db: Db, name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
  const collection = await db.createCollection(name, {
    ...(resource.schema != null ? {
      validator: {
        $jsonSchema: patchJsonSchema(schemaToMongoSchema(resource.schema))
      }
    } : {})
  })

  if (resource.indexes != null) {
    await Promise.all(resource.indexes.map(
      async index => await collection.createIndex(index.index, {
        name: index.name, ...((index.options != null) ? index.options : {})
      })
    ))
  }

  return collection
}

export const updateCollection = async (db: Db, name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
  if (resource.schema != null) {
    const $jsonSchema = patchJsonSchema(schemaToMongoSchema(resource.schema))
    await db.command({ collMod: name, validator: { $jsonSchema } })
  }

  const collection = db.collection(name)

  await updateIndexes(collection, resource)

  return collection
}

const patchJsonSchema = (schema: Document): Document => {
  if (schema.properties != null) {
    if (schema.properties._id == null) {
      schema.properties._id = { bsonType: 'objectId' }
    }
  }
  return schema
}
