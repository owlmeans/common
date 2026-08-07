import type { BasicConfig, BasicContext, BasicResource, LazyService } from '@owlmeans/context'
import type { MigrationStage } from './consts.js'

export interface Resource<T extends ResourceRecord> extends BasicResource {
  /**
   * @throws {UnknownRecordError}
   */
  get: <Type extends T>(id: string, field?: Getter, opts?: LifecycleOptions) => Promise<Type>
  load: <Type extends T>(id: string, field?: Getter, opts?: LifecycleOptions) => Promise<Type | null>
  list: <Type extends T>(criteria?: ListOptions | ListCriteria, opts?: ListOptions) => Promise<ListResult<Type>>
  save: <Type extends T>(record: Partial<Type>, opts?: Getter) => Promise<Type>
  /**
   * @throws {RecordExists}
   */
  create: <Type extends T>(record: Partial<Type>, opts?: LifecycleOptions) => Promise<Type>
  /**
   * @throws {UnknownRecordError}
   */
  update: <Type extends T>(record: Partial<Type>, opts?: Getter) => Promise<Type>
  delete: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type | null>
  /**
   * @throws {UnknownRecordError}
   */
  pick: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type>
}

export interface ResourceRecord {
  id?: string
}

type MaybeArray<T> = T | T[]
export interface ListCriteria extends Record<string, MaybeArray<ListCriteria | number | string | undefined>> { }

export interface ListOptions {
  pager?: ListPager
  criteria?: ListCriteria
}

export type ListSort = string | [string, boolean?]

export interface ListPager {
  sort?: ListSort[]
  page?: number
  size?: number
  total?: number
}

export interface ListResult<T extends ResourceRecord> {
  items: T[]
  pager?: ListPager
}

type Getter = string | GetterOptions

export interface GetterOptions extends LifecycleOptions {
  field?: string
}

export interface LifecycleOptions {
  ttl?: number | Date | string
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

export interface ResourceLocker<T extends ResourceRecord> {
  lock: (record: Partial<T>, fields?: string[]) => Promise<T>
  unlock: (record: Partial<T>, fields?: string[]) => Promise<T>
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
  entitySensitive?: boolean
  serviceSensitive?: boolean
  encryptionKey?: string
  meta?: P
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
