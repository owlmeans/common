import type { ListCriteria, Resource, ResourceRecord } from '@owlmeans/resource'

export interface StateResource<T extends ResourceRecord> extends Resource<T> {
  /**
   * @returns unsubscribe function
   */
  subscribe: (params: StateSubscriptionOption<T>) => [() => void, StateModel<T>[]]
  listen: (listener: StateListener<T>) => () => void
  erase: () => Promise<void>

  /**
   * Every record held, as a plain array.
   *
   * `list()` answers the `Resource` contract and therefore returns `{ items, pager }`; this is
   * the same data without the envelope, for the overwhelmingly common case of "give me what is
   * in the store". Destructuring the wrong one of the two is a silent empty render, so both
   * spellings exist rather than one being the trap the other rescues.
   */
  all: () => Promise<T[]>

  /**
   * The records the criteria accepts, as a plain array.
   *
   * Same criteria language as the server resources (`@owlmeans/postgres-resource`), so a filter
   * written for an endpoint means the same thing applied locally. Records the store does not
   * hold cannot match — this filters what has been loaded, it never fetches.
   */
  match: (criteria?: ListCriteria) => Promise<T[]>
}

export interface StateSubscriptionOption<T extends ResourceRecord> {
  id?: string | string[]
  _systemId?: string
  /**
   * Subscribe to a live QUERY instead of to fixed ids.
   *
   * The listener is called with every record the criteria currently accepts, and again whenever
   * a create, update or delete changes that answer — so a list screen never recomputes ids and
   * never re-subscribes to keep up. Ignored when `id` is given: a subscription is either to
   * named records or to a query, never to both.
   *
   * Unlike an id subscription, this one creates nothing: an empty store yields an empty list
   * rather than a placeholder record.
   */
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
