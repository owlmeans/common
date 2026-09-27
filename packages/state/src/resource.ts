import { appendContextual } from '@owlmeans/context'
import type { BasicConfig as Config, BasicContext as Context } from '@owlmeans/context'
import {
  applyQuery, filterRecords, firstMatch, RecordExists, sortRecords, UnknownRecordError,
  UnsupportedArgumentError
} from '@owlmeans/resource'
import type {
  Criteria, FirstOptions, ListOptions, ResourceRecord, SubscribeOptions, Ttl, Unsubscribe,
  WriteOptions
} from '@owlmeans/resource'
import { StateConfigError } from './errors.js'
import { createStateModel } from './utils/model.js'
import type {
  StateConfig, StateEvent, StateModel, StateResource, StateResourceAppend
} from './types.js'

/**
 * The one slot of a `single` resource. It is a KEY and never a value: nothing writes it into a
 * record, so a single resource's record still carries whatever id it arrived with, or none.
 */
const SOLE = ''

/** The channel writes publish on, and the one a subscriber gets when it names none. */
const CHANGES = 'changes'

/** The alias a context's first state resource takes when nothing else is asked for. */
const STATE = 'state'

/** Milliseconds until a subscription expires: a number is seconds from now, a Date the instant. */
const expiresIn = (ttl: Ttl): number =>
  ttl instanceof Date ? ttl.getTime() - Date.now() : ttl * 1000

interface QueryWatch<T extends ResourceRecord> {
  where?: Criteria<T>
  opts?: FirstOptions<T>
  listener: (models: StateModel<T>[]) => void
  last: StateModel<T>[]
}

interface Subscription<T extends ResourceRecord> {
  handler: (value: StateEvent<T>) => void | Promise<void>
  channel: string
  once: boolean
  timer?: ReturnType<typeof setTimeout>
}

export const createStateResource = <T extends ResourceRecord>(
  alias: string = STATE, cfg?: StateConfig<T>
): StateResource<T> => {
  const config: StateConfig<T> = { ...cfg }
  const idField = (config.id ?? 'id') as keyof T & string
  const single = config.single === true

  const store = new Map<string, T>()

  /** One registry per kind of subscriber: a key, a query, and the change stream. */
  const watchers = new Map<string, Set<(model: StateModel<T>) => void>>()
  const queries = new Set<QueryWatch<T>>()
  const subscribers = new Set<Subscription<T>>()

  /**
   * The model handed out for a key, kept until the record behind it is replaced. React compares
   * snapshots by reference, so rebuilding a model on every unrelated write would re-render every
   * screen bound to the store.
   */
  const models = new Map<string, { from: T | undefined, model: StateModel<T> }>()

  const records = (): T[] => [...store.values()]

  /**
   * The key a record is filed under.
   *
   * @throws {StateConfigError} `NoId` — nothing here mints ids, so a record without one is
   * misfiled rather than new.
   */
  const keyOf = (record: Partial<T>): string => {
    if (single) {
      return SOLE
    }
    const id = record[idField] as unknown
    if (typeof id !== 'string' || id === '') {
      throw new StateConfigError(StateConfigError.NoId)
    }

    return id
  }

  /**
   * The key an id addresses.
   *
   * @throws {StateConfigError} `NonSingle` — an absent id on a resource that holds many records.
   */
  const keyFor = (id: string | undefined): string => {
    if (id == null) {
      if (!single) {
        throw new StateConfigError(StateConfigError.NonSingle)
      }

      return SOLE
    }

    return single ? SOLE : id
  }

  /** The key a record already in the store is filed under — its id is known to be there. */
  const storedKey = (record: T): string =>
    single ? SOLE : record[idField] as unknown as string

  /**
   * A read by id. On a single resource the one record answers only to its own id, so asking for
   * a different one is a miss rather than the sole record under a wrong name.
   */
  const read = (id: string): T | null => {
    const record = store.get(keyFor(id))
    if (record == null) {
      return null
    }
    const own = record[idField] as unknown
    if (single && own != null && own !== id) {
      return null
    }

    return record
  }

  const first = (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): T | null =>
    typeof idOrWhere === 'string' ? read(idOrWhere) : firstMatch(records(), idOrWhere, opts)

  /** The store keeps no expiring records, so a ttl would be silently dropped. */
  const refuseTtl = (opts?: WriteOptions): void => {
    if (opts?.ttl != null) {
      throw new UnsupportedArgumentError('ttl')
    }
  }

  const modelFor = (key: string): StateModel<T> => {
    const record = store.get(key)
    const cached = models.get(key)
    if (cached != null && cached.from === record) {
      return cached.model
    }

    const id = (record?.[idField] as unknown as string | undefined) ?? (key === SOLE ? undefined : key)
    const model = createStateModel<T>({
      id,
      record,
      default: config.default,
      write: async value => {
        const next = { ...value } as T
        if (!single) {
          (next as Record<string, unknown>)[idField] = key
        }

        return write(key, next)
      },
      drop: async () => {
        const removed = store.get(key)
        if (removed == null) {
          return
        }
        store.delete(key)
        notify('remove', [[key, removed]])
      }
    })
    models.set(key, { from: record, model })

    return model
  }

  /**
   * The model for "nothing is addressed yet" — one instance, reused.
   *
   * It must be the SAME reference every time: a React subscriber compares snapshots by identity,
   * and a freshly built model would read as a change on every render and loop. Writing through it
   * is refused rather than silently dropped, because a caller that writes without an id has lost
   * track of which record it meant.
   */
  let blank: StateModel<T> | undefined
  const emptyModel = (): StateModel<T> => blank ??= createStateModel<T>({
    id: undefined,
    record: undefined,
    default: config.default,
    write: async () => { throw new StateConfigError(StateConfigError.NoId) },
    drop: async () => { throw new StateConfigError(StateConfigError.NoId) }
  })

  const queryModels = (watch: QueryWatch<T>): StateModel<T>[] =>
    sortRecords(filterRecords(records(), watch.where), watch.opts?.sort)
      .map(record => modelFor(storedKey(record)))

  const same = (left: StateModel<T>[], right: StateModel<T>[]): boolean =>
    left.length === right.length && left.every((model, index) => model === right[index])

  /** Deliver on one channel. Returns what the handlers gave back, for a caller that awaits. */
  const deliver = (event: StateEvent<T>, channel: string): Array<void | Promise<void>> => {
    const delivered: Array<void | Promise<void>> = []
    for (const subscription of [...subscribers]) {
      if (subscription.channel !== channel) {
        continue
      }
      if (subscription.once) {
        subscribers.delete(subscription)
        if (subscription.timer != null) {
          clearTimeout(subscription.timer)
        }
      }
      delivered.push(subscription.handler(event))
    }

    return delivered
  }

  /**
   * Tell everyone what changed. Key watchers hear only about their own record; every live query
   * is re-evaluated, because a write can move a record into a set it was not in and deciding
   * whether it did is the same work as re-running the query.
   */
  const notify = (type: StateEvent<T>['type'], changed: Array<[string, T]>): void => {
    if (changed.length < 1) {
      return
    }
    for (const [key] of changed) {
      const listeners = watchers.get(key)
      if (listeners == null) {
        continue
      }
      const model = modelFor(key)
      for (const listener of [...listeners]) {
        listener(model)
      }
    }
    for (const watch of [...queries]) {
      const current = queryModels(watch)
      if (same(watch.last, current)) {
        continue
      }
      watch.last = current
      watch.listener(current)
    }
    deliver({ type, records: changed.map(([, record]) => record) }, CHANGES)
    /**
     * A key nobody watches and nothing is stored under has no model worth keeping — otherwise the
     * cache grows with every record the store ever held. A watched key keeps its entry, so an
     * empty model stays the same object and a screen bound to a deleted record does not re-render
     * on every unrelated write.
     */
    for (const [key] of changed) {
      if (!store.has(key) && !watchers.has(key)) {
        models.delete(key)
      }
    }
  }

  const write = (key: string, record: Partial<T>): T => {
    const value = { ...record } as T
    store.set(key, value)
    notify('set', [[key, value]])

    return value
  }

  const resource: StateResource<T> = appendContextual<StateResource<T>>(alias, {
    config,

    get: async (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): Promise<T> => {
      const record = first(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof idOrWhere === 'string' ? idOrWhere : 'criteria')
      }

      return record
    },

    load: async (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): Promise<T | null> =>
      first(idOrWhere, opts),

    /** Unpaged unless a size is asked for: a screen reading the store expects all of it. */
    list: async (where?: Criteria<T>, opts?: ListOptions<T>) => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(records(), where, opts)
    },

    count: async (where?: Criteria<T>) => filterRecords(records(), where).length,

    create: async (record: Partial<T>, opts?: WriteOptions) => {
      refuseTtl(opts)
      const key = keyOf(record)
      if (store.has(key)) {
        throw new RecordExists(key === SOLE ? alias : key)
      }

      return write(key, record)
    },

    /** Replaces the stored record rather than merging into it, as the contract says. */
    update: async (record: Partial<T>, opts?: WriteOptions) => {
      refuseTtl(opts)
      const key = keyOf(record)
      if (!store.has(key)) {
        throw new UnknownRecordError(key === SOLE ? alias : key)
      }

      return write(key, record)
    },

    save: async (record: Partial<T>, opts?: WriteOptions) => {
      refuseTtl(opts)

      return write(keyOf(record), record)
    },

    delete: async (id: string) => {
      const record = read(id)
      if (record == null) {
        return null
      }
      const key = keyFor(id)
      store.delete(key)
      notify('remove', [[key, record]])

      return record
    },

    take: async (id: string) => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    purge: async (where: Criteria<T>) => {
      if (where == null || Object.keys(where).length < 1) {
        throw new UnsupportedArgumentError('purge:empty-criteria')
      }
      const removed = filterRecords(records(), where)
        .map((record): [string, T] => [storedKey(record), record])
      for (const [key] of removed) {
        store.delete(key)
      }
      notify('remove', removed)

      return removed.length
    },

    /**
     * The store is rewritten before anything is told about it, so a subscriber never sees the
     * half-applied set. On a `single` resource every record lands in the one slot, which means a
     * list of several collapses to the last of them.
     */
    replace: async list => {
      const written = list.map((record): [string, T] => [keyOf(record), { ...record }])
      const keys = new Set(written.map(([key]) => key))
      const dropped = [...store.entries()].filter(([key]) => !keys.has(key))
      for (const [key] of dropped) {
        store.delete(key)
      }
      for (const [key, record] of written) {
        store.set(key, record)
      }
      notify('remove', dropped)
      notify('set', written)
    },

    clear: async () => {
      const dropped = [...store.entries()]
      store.clear()
      notify('remove', dropped)
    },

    watch: (id, listener) => {
      /**
       * Watching before there is anything to watch is a RENDERING state, not a mistake.
       *
       * A screen binds to `useStoreModel(project.record.id)` while the project is still loading,
       * so the id is legitimately absent for the first renders. Treating that as the
       * configuration error it would be on `load()` or `save()` crashes the component tree over
       * data that is simply not here yet. So an absent id on a listed resource watches nothing
       * and reports an empty model; the error stays where it means something — a direct read or
       * write with no id, which cannot be anything but a mistake.
       */
      if (id == null && !single) {
        listener(emptyModel())

        return () => { }
      }

      const key = keyFor(id)
      let listeners = watchers.get(key)
      if (listeners == null) {
        listeners = new Set()
        watchers.set(key, listeners)
      }
      const bound = listeners
      bound.add(listener)
      /**
       * Seeded before `watch` returns, and seeded with nothing when the store holds nothing: an
       * id subscription creates NO record, so a screen bound to an unknown id gets an empty
       * model rather than putting a blank row into every list reading the same store.
       */
      listener(modelFor(key))

      /**
       * The cached model outlives the subscription on purpose. A React subscriber takes its first
       * snapshot by watching and stopping again, and a rebuilt model would read as a changed value
       * the moment it subscribes for real. Keys the store no longer holds are dropped on the next
       * change to them instead.
       */
      return () => {
        bound.delete(listener)
        if (bound.size < 1) {
          watchers.delete(key)
        }
      }
    },

    query: (where, listener, opts) => {
      const watch: QueryWatch<T> = { where, opts, listener, last: [] }
      queries.add(watch)
      watch.last = queryModels(watch)
      listener(watch.last)

      return () => { queries.delete(watch) }
    },

    /**
     * Writes announce themselves on the default channel, so publishing is for what the store
     * cannot know it did — a change that arrived from elsewhere, or a channel of a caller's own.
     */
    publish: async (value: StateEvent<T>, channel?: string) => {
      await Promise.all(deliver(value, channel ?? CHANGES))
    },

    subscribe: async (
      handler: (value: StateEvent<T>) => void | Promise<void>, opts?: SubscribeOptions
    ) => {
      const subscription: Subscription<T> = {
        handler, channel: opts?.channel ?? CHANGES, once: opts?.once === true
      }
      subscribers.add(subscription)

      const stop: Unsubscribe = async () => {
        subscribers.delete(subscription)
        if (subscription.timer != null) {
          clearTimeout(subscription.timer)
          subscription.timer = undefined
        }
      }

      if (opts?.ttl != null) {
        subscription.timer = setTimeout(() => void stop(), expiresIn(opts.ttl))
      }

      return stop
    }
  })

  return resource
}

/**
 * Register a state resource on the context and expose `getStateResource`.
 *
 * Idempotent: appending the same alias twice keeps the resource that is already there, so a
 * setup that runs more than once does not drop what the store has collected. The first alias
 * appended is the one `getStateResource()` answers with when it is called without one.
 */
export const appendStateResource = <
  C extends Config, T extends Context<C>, R extends ResourceRecord = ResourceRecord
>(ctx: T, alias: string = STATE, cfg?: StateConfig<R>): T & StateResourceAppend => {
  const _ctx = ctx as T & StateResourceAppend

  if (!_ctx.hasResource(alias)) {
    _ctx.registerResource(createStateResource<R>(alias, cfg))
  }

  if (_ctx.getStateResource == null) {
    _ctx.getStateResource = (<S extends ResourceRecord>(_alias?: string) =>
      ctx.resource<StateResource<S>>(_alias ?? alias)) as StateResourceAppend['getStateResource']
  }

  return _ctx
}
