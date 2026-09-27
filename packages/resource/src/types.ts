import type { BasicConfig, BasicContext, BasicResource, LazyService } from '@owlmeans/context'
import type { MigrationStage } from './consts.js'

export interface ResourceRecord {
  id?: string
}

/** Operators a single field can be constrained by. */
export interface FieldOperators<V> {
  $eq?: V
  $ne?: V
  $gt?: V
  $gte?: V
  $lt?: V
  $lte?: V
  $in?: Array<V | null>
  $nin?: Array<V | null>
  $exists?: boolean
  $null?: boolean
  $like?: string
  $ilike?: string
  $regex?: string
  $startsWith?: string
  $endsWith?: string
  $between?: [V, V]
  $contains?: V | V[]
  $contained?: V[]
  $overlaps?: V[]
}

/**
 * How one field is constrained: a bare value is equality, a bare ARRAY is "any of these", `null`
 * asks for the absence of a value, and `undefined` is SKIPPED — an untouched filter must never
 * empty a list.
 */
export type FieldCriteria<V> = V | Array<V | null> | FieldOperators<NonNullable<V>> | null | undefined

/**
 * A query over records of `T`. Keys are the record's own fields, so a typo is a compile error;
 * a dotted key reaches into a nested value (or a jsonb column) and stays open.
 */
export type Criteria<T> =
  & { [K in keyof T & string]?: FieldCriteria<T[K]> }
  & { [path: `${string}.${string}`]: FieldCriteria<unknown> }
  & { $and?: Criteria<T>[], $or?: Criteria<T>[], $not?: Criteria<T> }

export type SortField<T> = (keyof T & string) | `${string}.${string}`

/** A bare field name sorts ascending. */
export type Sort<T> = SortField<T> | { field: SortField<T>, order?: 'asc' | 'desc' }

export interface FirstOptions<T> {
  sort?: Sort<T>[]
}

/**
 * Paging is opt-in per call. A backend that cannot afford an unbounded read applies its own
 * default size when none is asked for; the in-memory ones return everything.
 */
export interface ListOptions<T> extends FirstOptions<T> {
  page?: number
  size?: number
}

/** The same question in one object — the shape an API carries over the wire. */
export interface ListQuery<T> extends ListOptions<T> {
  where?: Criteria<T>
}

export interface ListResult<T extends ResourceRecord> {
  items: T[]
  total: number
  page?: number
  size?: number
}

export type Ttl = number | Date

export interface WriteOptions {
  /** Seconds from now, or the instant to expire at. Backends without expiry refuse it. */
  ttl?: Ttl
}

/**
 * Typed CRUD over records. Reads take either an id or a criteria object, so fetching one record by
 * several fields is a single call rather than a list whose first element is taken.
 */
export interface Resource<T extends ResourceRecord> extends BasicResource {
  /**
   * @throws {UnknownRecordError}
   */
  get(id: string): Promise<T>
  get(where: Criteria<T>, opts?: FirstOptions<T>): Promise<T>
  load(id: string): Promise<T | null>
  load(where: Criteria<T>, opts?: FirstOptions<T>): Promise<T | null>
  list(where?: Criteria<T>, opts?: ListOptions<T>): Promise<ListResult<T>>
  count(where?: Criteria<T>): Promise<number>
  /**
   * @throws {RecordExists}
   */
  create(record: Partial<T>, opts?: WriteOptions): Promise<T>
  /**
   * Replaces the whole record.
   * @throws {UnknownRecordError}
   */
  update(record: Partial<T>, opts?: WriteOptions): Promise<T>
  /** Creates when the record carries no id, replaces otherwise. */
  save(record: Partial<T>, opts?: WriteOptions): Promise<T>
  delete(id: string): Promise<T | null>
  /**
   * Delete-and-return — the consume-once read. Absence is an error here; use `delete` when it is not.
   * @throws {UnknownRecordError}
   */
  take(id: string): Promise<T>
  /** Bulk delete. Refuses an empty criteria object rather than emptying the resource. */
  purge(where: Criteria<T>): Promise<number>
}

export type Unsubscribe = () => Promise<void>

export interface SubscribeOptions {
  channel?: string
  once?: boolean
  ttl?: Ttl
}

/** Optional capability: a backend that can carry messages beside its records. */
export interface PubSubResource<T> {
  publish(value: T, channel?: string): Promise<void>
  subscribe(handler: (value: T) => void | Promise<void>, opts?: SubscribeOptions): Promise<Unsubscribe>
}

/** Optional capability: watching ONE record for changes (redis keyspace notifications). */
export interface WatchableResource<T> {
  watch(id: string, handler: (value: T | null) => void | Promise<void>, opts?: Omit<SubscribeOptions, 'channel'>): Promise<Unsubscribe>
}

/** Optional capability: an append-only log with consumer groups. */
export interface StreamResource<T> {
  stream(key: string, value: T): Promise<void>
  consume(key: string, opts?: { group?: string, consumer?: string, block?: number }): AsyncGenerator<T>
}

/** Optional capability: field level encryption at rest. */
export interface LockableResource<T extends ResourceRecord> {
  lock: (record: Partial<T>, fields?: string[]) => Promise<T>
  unlock: (record: Partial<T>, fields?: string[]) => Promise<T>
}

export interface ResourceMaker<R extends ResourceRecord, T extends Resource<R> = Resource<R>> {
  (dbAlias?: string, serviceAlias?: string): T
}

export interface ResourceDbService<Db, Client> extends LazyService {
  clients: Record<string, Client>
  /**
   * @abstract
   */
  db: (alias?: string) => Promise<Db>

  /**
   * @final
   */
  config: (alias?: string) => DbConfig

  /**
   * @abstract
   */
  initialize: (alias?: string) => Promise<void>

  /**
   * @final
   */
  ensureConfigAlias: (alias?: string | DbConfig) => string

  /**
   * @final
   */
  name: (alias?: string | DbConfig) => string

  /**
   * @final
   */
  client: (alias?: string) => Promise<Client>
}

export interface DbLocker<T extends ResourceRecord> {
  lock: (alias: string, record: Partial<T>, fields: string[]) => Promise<T>
  unlock: (alias: string, record: Partial<T>, fields: string[]) => Promise<T>
}

export interface DbConfig<P extends {} = {}> {
  service: string
  alias?: string
  host: string | string[]
  port?: number
  user?: string
  secret?: string
  schema?: string
  resourcePrefix?: string
  encryptionKey?: string
  meta?: P
}

/**
 * Optional migration capability of a Resource implementation — optional the same way
 * pub/sub is on redis resources: a backend that supports code migrations extends this
 * interface (mongo, postgres), a backend with nothing to migrate simply never implements
 * it. The base {@link Resource} contract stays migration free.
 *
 * The capability is automatic: implementations run the registered migrations during
 * resource initialization (app setup), so a migration only has to be registered — never
 * invoked. Backends with a durable structure also implement {@link MigrationStore}, the
 * register that tracks which migrations have been applied.
 */
export interface MigratableResource<Tx = unknown, Self = unknown> {
  /**
   * Register a migration, applied once per database in declaration order.
   *
   * Chainable and idempotent: re-registering the same name with the same body is a no-op, which is
   * what makes it safe to call from a resource maker that runs more than once for the same alias.
   * Re-registering a *changed* body under a used name throws {@link MigrationConflict}.
   */
  migration: (name: string, apply: (tx: Tx) => Promise<void>, stage?: MigrationStage) => Self
  /** The registered migrations for this resource's alias. Read-only; use {@link MigratableResource.migration}. */
  migrations: () => MigrationRegistry<Tx>
}

export interface Migration<Tx = unknown> {
  name: string
  stage: MigrationStage
  apply: (tx: Tx) => Promise<void>
  /** Stable hash of the migration body — detects edits to an already applied migration. */
  checksum: string
}

export interface MigrationRegistry<Tx = unknown> {
  register: (name: string, apply: (tx: Tx) => Promise<void>, stage?: MigrationStage) => MigrationRegistry<Tx>
  list: (stage?: MigrationStage) => Migration<Tx>[]
  has: (name: string) => boolean
}

/**
 * The database specific half of the migration subsystem. Postgres and Mongo each
 * provide an implementation; {@link runMigrations} stays storage agnostic.
 */
export interface MigrationStore<Tx = unknown> {
  /** Create the tracking structure if it's absent. */
  ensure: () => Promise<void>
  /** Names already applied for the given resource alias, mapped to their recorded checksum. */
  applied: (alias: string) => Promise<Record<string, string | null>>
  /** Record migrations as applied *without* running them — used on freshly created structures. */
  baseline: (alias: string, migrations: Migration<Tx>[]) => Promise<void>
  /** Run one migration and record it atomically. */
  run: (alias: string, migration: Migration<Tx>) => Promise<void>
}

export interface MigrationRunOptions {
  stage?: MigrationStage
  /**
   * The structure has just been created, so every registered migration is already
   * satisfied by it — record them instead of running them.
   */
  baseline?: boolean
  /** Throw when an already applied migration's body has changed. Defaults to `true`. */
  strictChecksum?: boolean
}

export interface MigrationReport {
  alias: string
  stage: MigrationStage
  applied: string[]
  baselined: string[]
  skipped: string[]
}

export interface Config extends BasicConfig {
  dbs?: DbConfig[]
}

export interface Context<C extends Config = Config> extends BasicContext<C> {
}
