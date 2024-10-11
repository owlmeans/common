import type { BasicConfig, BasicContext, BasicResource, LazyService } from '@owlmeans/context'

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
  meta?: P
}

export interface Config extends BasicConfig {
  dbs?: DbConfig[]
}

export interface Context<C extends Config = Config> extends BasicContext<C> {
}
