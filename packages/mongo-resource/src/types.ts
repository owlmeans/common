import type {
  Resource, ResourceRecord, ResourceDbService, DbLocker, ResourceLocker, MigrationRegistry, MigrationStage
} from '@owlmeans/resource'
import type { Collection, CreateIndexesOptions, Db, IndexSpecification, MongoClient } from 'mongodb'
import type { AnySchema } from 'ajv'

/**
 * What a mongo migration is handed.
 *
 * Deliberately not a session or transaction: multi-document transactions require a replica
 * set, and a standalone `mongod` — the usual development and CI target — rejects them
 * outright. A migration therefore has to be written to tolerate being interrupted partway,
 * which in practice means idempotent updates rather than read-then-write.
 */
export interface MongoTx {
  db: Db
  /** The owning resource's collection. */
  collection: Collection
  /** Another registered mongo resource's collection; omit the alias for the owning one. */
  use: (alias?: string) => Collection
  /** A collection *name*, for `$lookup.from` and other stages that take one rather than a handle. */
  ref: (alias?: string) => string
}

export interface MongoResource<T extends ResourceRecord> extends Resource<T>, ResourceLocker<T> {
  name?: string
  schema?: AnySchema
  indexes?: Array<{ name: string, index: IndexSpecification, options?: CreateIndexesOptions }>
  collection: Collection
  db: () => Promise<Db>
  client: () => Promise<MongoClient>
  index: <Type extends MongoResource<T>>(name: string, index: IndexSpecification, options?: CreateIndexesOptions) => Type
  /**
   * Register a migration, applied once per database in declaration order.
   *
   * Chainable and idempotent: re-registering the same name with the same body is a no-op,
   * which is what makes it safe to call from a resource maker that `reinitializeContext`
   * re-runs. Re-registering a *changed* body under a used name throws.
   */
  migration: <Type extends MongoResource<T>>(
    name: string, apply: (tx: MongoTx) => Promise<void>, stage?: MigrationStage
  ) => Type
  /** The registered migrations for this alias. Read-only; use {@link MongoResource.migration}. */
  migrations: () => MigrationRegistry<MongoTx>
  getDefaults: () => Partial<T>
}

export interface MongoDbService extends ResourceDbService<Db, MongoClient>, DbLocker<ResourceRecord> {
}
