import type { BasicResource } from '@owlmeans/context'
import type { ListCriteriaParams } from './utils/types.js'

export interface Resource<T extends ResourceRecord> extends BasicResource {
  /**
   * @throws {UnknownRecordError}
   */
  get: <Type extends T>(id: string, field?: Getter, opts?: LivecycleOptions) => Promise<Type>
  load: <Type extends T>(id: string, field?: Getter, opts?: LivecycleOptions) => Promise<Type | null>
  list: <Type extends T>(criteria?: ListCriteriaParams, opts?: ListOptions) => Promise<ListResult<Type>>
  save: <Type extends T>(record: Partial<Type>, opts?: LivecycleOptions) => Promise<Type>
  create: <Type extends T>(record: Partial<Type>, opts?: LivecycleOptions) => Promise<Type>
  /**
   * @throws {UnknownRecordError}
   */
  update: <Type extends T>(record: Type, opts?: Getter) => Promise<Type>
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

export interface GetterOptions extends LivecycleOptions {
  field: string
}

export interface LivecycleOptions {
  ttl?: number | Date | string
}
