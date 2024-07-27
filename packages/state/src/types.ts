import type { ListCriteria, Resource, ResourceRecord } from '@owlmeans/resource'

export interface StateResource<T extends ResourceRecord> extends Resource<T> {
  /**
   * @returns unsubscribe function
   */
  subscribe: (params: StateSubscriptionOption<T>) => [() => void, StateModel<T>[]]
  listen: (listener: StateListener<T>) => () => void
}

export interface StateSubscriptionOption<T extends ResourceRecord> {
  id?: string | string[]
  query?: ListCriteria
  default?: Partial<T>
  listener: StateListener<T>
}

export interface StateListener<T extends ResourceRecord> {
  (record: StateModel<T>[]): void | Promise<void>
}

export interface StateModel<T extends ResourceRecord> {
  record: T,

  commit: (force?: boolean) => void

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
