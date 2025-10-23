import type { ListCriteria, Resource, ResourceRecord } from '@owlmeans/resource'

export interface StateResource<T extends ResourceRecord> extends Resource<T> {
  /**
   * @returns unsubscribe function
   */
  subscribe: (params: StateSubscriptionOption<T>) => [() => void, StateModel<T>[]]
  listen: (listener: StateListener<T>) => () => void
  erase: () => Promise<void>
}

export interface StateSubscriptionOption<T extends ResourceRecord> {
  id?: string | string[]
  _systemId?: string
  query?: ListCriteria
  default?: Partial<T>
  listener: StateListener<T>
}

export interface StateListener<T extends ResourceRecord> {
  (record: StateModel<T>[], systemId?: string): void | Promise<void>
}

export interface StateModel<T extends ResourceRecord> {
  record: T,

  commit: (force?: boolean) => void

  update: (data?: Partial<T>) => void

  clear: () => void
}

export interface StateResourceAppend {
  getStateResource: <T extends ResourceRecord>(alias?: string) => StateResource<T>
}

export interface UseStoreHelper {
  <T extends ResourceRecord>(id?: string | UseStoreHelperOptions<T>, opts?: string | boolean | UseStoreHelperOptions<T>): StateModel<T>
}

export interface UseStoreListHelper {
  <T extends ResourceRecord>(id?: string | string[] | UseStoreHelperOptions<T>, opts?: string | boolean | UseStoreHelperOptions<T>): StateModel<T>[]
}

export interface UseStoreHelperOptions<T extends ResourceRecord> extends Omit<StateSubscriptionOption<T>, "listener"> {
  listen?: boolean
  resource?: string
}
