import type {
  Resource, ResourceRecord, ResourceDbService, DbLocker, ResourceLocker, MigratableResource
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

/**
 * A declared ObjectId reference — a record field that stores another record's id.
 *
 * The resource converts the field between the string ids records carry and the `ObjectId`
 * the collection stores, exactly the way it already does for `_id`: strings in records and
 * criteria, `ObjectId` on the wire. Declaring a reference also gives the field a mongo
 * level index and registers the system migration that converts pre-existing string values.
 */
export interface MongoReference {
  /** Top level record property holding the reference (a single id or an array of ids). */
  field: string
  /** Alias of the referenced resource. Informational — conversion never resolves it. */
  resource?: string
  /** Skip the automatic `{ [field]: 1 }` index. */
  noIndex?: boolean
}

export interface MongoRefOptions {
  resource?: string
  noIndex?: boolean
}

export interface MongoResource<T extends ResourceRecord> extends Resource<T>, ResourceLocker<T>, MigratableResource<MongoTx> {
  name?: string
  /**
   * The db-config alias this resource was registered against.
   *
   * Exposed because a collection's NAME depends on it: two resources in one database can carry
   * different `resourcePrefix`es, so anything naming a collection on another resource's behalf —
   * a migration reaching across aliases, for one — has to read that resource's own config rather
   * than assume its caller's.
   */
  dbAlias?: string
  serviceAlias?: string
  schema?: AnySchema
  indexes?: Array<{ name: string, index: IndexSpecification, options?: CreateIndexesOptions }>
  collection: Collection
  db: () => Promise<Db>
  client: () => Promise<MongoClient>
  index: <Type extends MongoResource<T>>(name: string, index: IndexSpecification, options?: CreateIndexesOptions) => Type
  /**
   * Declare that a field stores another record's id.
   *
   * Chainable and idempotent like {@link MigratableResource.migration}, and stored the same
   * way — per alias at module scope — because losing the declaration to a context rebuild
   * would silently stop the string/ObjectId conversion for the field.
   *
   * Declare only fields whose values really are mongo ids (assigned from another record's
   * `id`). Composite keys, external provider ids, DIDs and business slugs must stay
   * strings — converting them corrupts the collection.
   */
  reference: (field: string, opts?: string | MongoRefOptions) => this
  /** The declared references of this alias. */
  references: () => MongoReference[]
  getDefaults: () => Partial<T>
}

export interface MongoDbService extends ResourceDbService<Db, MongoClient>, DbLocker<ResourceRecord> {
}
