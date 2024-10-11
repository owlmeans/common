import type { Resource, ResourceRecord, ResourceDbService } from '@owlmeans/resource'
import type { Collection, CreateIndexesOptions, Db, IndexSpecification, MongoClient } from 'mongodb'
import type { AnySchema } from 'ajv'

export interface MongoResource<T extends ResourceRecord> extends Resource<T> {
  name?: string
  schema?: AnySchema
  indexes?: Array<{ name: string, index: IndexSpecification, options?: CreateIndexesOptions }>
  collection: Collection
  db: () => Promise<Db>
  client: () => Promise<MongoClient>
  index: <Type extends MongoResource<T>>(name: string, index: IndexSpecification, options?: CreateIndexesOptions) => Type
  getDefaults: () => Partial<T>
}

export interface MongoDbService extends ResourceDbService<Db, MongoClient> {
}
