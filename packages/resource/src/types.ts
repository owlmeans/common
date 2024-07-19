import type { BasicResource } from '@owlmeans/context'

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

export interface ListCriteria extends Record<string, ListCriteria | number | string | undefined> { }

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
