import type { LazyService } from '@owlmeans/context'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { Collection, CreateIndexesOptions, Db, IndexSpecification } from 'mongodb'
import type { AnySchema } from 'ajv'
import type { DbConfig } from '@owlmeans/config'

export interface MongoResource<T extends ResourceRecord> extends Resource<T> {
  name?: string
  schema?: AnySchema
  indexes?: Array<{ name: string, index: IndexSpecification, options?: CreateIndexesOptions }>
  collection: Collection
  index: <Type extends MongoResource<T>>(name: string, index: IndexSpecification, options?: CreateIndexesOptions) => Type
  getDefaults: () => Partial<T>
}

export interface MongoDbService extends LazyService {
  db: (alias?: string) => Promise<Db>
  config: (alias?: string) => DbConfig
}

export interface ResourceMaker<R extends ResourceRecord, T extends MongoResource<R> = MongoResource<R>> {
  (dbAlias?: string, serviceAlias?: string): T
}
