import type {
  Criteria, FirstOptions, PubSubResource, Resource, ResourceRecord
} from '@owlmeans/resource'

/**
 * How a state resource is keyed and what it shows before anything is loaded.
 *
 * Everything here is optional: an unconfigured resource keys records by `id`, holds as many of
 * them as it is given, and shows an empty object until a record arrives.
 */
export interface StateConfig<T extends ResourceRecord> {
  /** The field records are keyed by. Defaults to `id`. */
  id?: keyof T & string
  /**
   * The resource holds exactly ONE record, which therefore needs no id — the current user, the
   * active session, a wizard being filled in. It is what makes `watch(undefined, ...)` (and so
   * `useStoreModel()` with no id) answerable: elsewhere there is no "the record" to address.
   */
  single?: boolean
  /**
   * What {@link StateModel.record} shows while the model is empty. A screen that binds to a
   * record before it has arrived reads the default instead of guarding every field — and the
   * store still holds nothing, so nothing renders it as a row.
   */
  default?: () => T
}

/** One change to the store, as its subscribers see it. */
export interface StateEvent<T extends ResourceRecord> {
  type: 'set' | 'remove'
  records: T[]
}

/**
 * The framework's client store: a `Resource` like any other, registered ON the context — which is
 * what separates it from a store held beside the app, since a screen, a service and a guard all
 * reach the same records through the same container.
 *
 * Reads and writes are the resource vocabulary; `watch` and `query` are the live half, and they
 * are synchronous on purpose — a React subscriber has to have its value before it renders.
 */
export interface StateResource<T extends ResourceRecord> extends Resource<T>, PubSubResource<StateEvent<T>> {
  readonly config: StateConfig<T>

  /**
   * Make the store agree with an authoritative list: every record given is written, and every
   * record the list does not name is dropped. That is the shape of "the server just told us what
   * exists" — saving each record one by one leaves the ones deleted elsewhere behind.
   */
  replace(records: T[]): Promise<void>

  /** Drop every record. */
  clear(): Promise<void>

  /**
   * Follow one record. The listener is called with the current model straight away — before
   * `watch` returns — and again on every change to that record, including its removal.
   *
   * `undefined` addresses the one record of a `single` resource; on any other it throws, since
   * there is nothing for it to mean.
   *
   * An absent id on a listed resource watches nothing and reports an empty model — a screen
   * binds before the record supplying the id exists, and that is a loading state, not an error.
   * @returns unsubscribe
   */
  watch(id: string | undefined, listener: (model: StateModel<T>) => void): () => void

  /**
   * Follow a live QUERY. The listener is called with the matching models straight away and again
   * whenever a write changes the answer, so a list screen never recomputes ids and never
   * re-subscribes to keep up. `undefined` matches every record.
   *
   * A query subscription creates nothing: an empty store yields an empty list.
   *
   * @returns unsubscribe
   */
  query(
    where: Criteria<T> | undefined,
    listener: (models: StateModel<T>[]) => void,
    opts?: FirstOptions<T>
  ): () => void
}

/**
 * One record, as something bound to it can hold: what it currently says, and how to change it.
 *
 * `record` is a snapshot — assigning into it changes nothing anyone can see. `update` is how a
 * change reaches the store and every other subscriber.
 */
export interface StateModel<T extends ResourceRecord> {
  readonly id: string | undefined
  /**
   * Nothing is loaded yet: the store holds no record under this model's key. This — not a
   * sentinel id, and not a placeholder record — is what "not there" looks like, so a subscription
   * to an unknown id leaves the store exactly as empty as it found it.
   */
  readonly empty: boolean
  /** The record, or the configured `default` while {@link StateModel.empty} is true. */
  readonly record: Readonly<T>
  /** Merge and write in one step. */
  update(patch: Partial<T>): Promise<T>
  /** Write what {@link StateModel.record} currently holds — including a default not yet stored. */
  commit(): Promise<T>
  clear(): Promise<void>
}

/**
 * A state alias that remembers the record type it addresses, so `getStateResource(TASKS)` is
 * typed without repeating `<Task>` at every call site. Built by {@link stateAlias}; it is a plain
 * string at runtime, so it works anywhere an alias is expected.
 */
export type StateAlias<T extends ResourceRecord> = string & { readonly _state?: T }

export interface GetStateResource {
  <T extends ResourceRecord>(alias: StateAlias<T>): StateResource<T>
  <T extends ResourceRecord = ResourceRecord>(alias?: string): StateResource<T>
}

export interface StateResourceAppend {
  /** The state resource under `alias`, or the first one appended to the context. */
  getStateResource: GetStateResource
}
