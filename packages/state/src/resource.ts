import { appendContextual } from '@owlmeans/context'
import { MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'
import { prepareListOptions } from '@owlmeans/resource'
import type { ListCriteria, LifecycleOptions, ListResult, ResourceRecord } from '@owlmeans/resource'
import type { StateListener, StateModel, StateResource, StateResourceAppend, StateSubscriptionOption } from './types.js'
import { DEFAULT_ALIAS, DEFAULT_ID } from './consts'
import { StateListenerError } from './errors.js'
import { createStateModel } from './utils/model.js'
import { filterRecords, sortRecords } from './utils/criteria.js'
import type { BasicContext as Context, BasicConfig as Config } from '@owlmeans/context'

export const createStateResource = <R extends ResourceRecord>(alias: string = DEFAULT_ALIAS): StateResource<R> => {
  const location = `state-resource:${alias}`

  const store: { [id: string]: R } = {}
  const recordToListener = new Map<string, Set<StateListener<R>>>()
  const listenerToRecord = new Map<StateListener<R>, string[]>()
  const globalListeners: StateListener<R>[] = []
  const systemToListeners: Record<string, StateListener<R>> = {}

  /**
   * Live query subscriptions.
   *
   * An id subscription is answered from a key; a query has to be re-evaluated against the whole
   * store whenever anything changes, because a write can add a record to a set it was not in.
   * Kept in two registries for the same reason the id side is: a React subscriber arrives with a
   * `_systemId` and must dedup across re-renders, while a plain listener must not silently
   * subscribe twice.
   */
  interface QuerySubscription {
    query: ListCriteria
    listener: StateListener<R>
    systemId?: string
  }
  const listenerToQuery = new Map<StateListener<R>, QuerySubscription>()
  const systemToQueries: Record<string, QuerySubscription> = {}

  type StoreKey = keyof typeof store

  const _notifyGlobalListeners = (records: R[]) => {
    globalListeners.forEach(listener => listener(
      records.map(record => createStateModel(record, resource))
    ))
  }

  const _usubscribe = (params: StateSubscriptionOption<R>) => () => {
    listenerToQuery.delete(params.listener)
    Object.entries(systemToQueries).some(([key, subscription]) => {
      if (subscription.listener === params.listener) {
        delete systemToQueries[key]
        return true
      }

      return false
    })

    const ids = listenerToRecord.get(params.listener)
    listenerToRecord.delete(params.listener)
    ids?.forEach(id => {
      const listeners = recordToListener.get(id)
      if (listeners != null) {
        listeners.delete(params.listener)
        if (listeners.size === 0) {
          recordToListener.delete(id)
        }
      }
    })
    Object.entries(systemToListeners).some(([key, listener]) => {
      if (listener === params.listener) {
        delete systemToListeners[key]
        return true
      }

      return false
    })
  }

  const _queryModels = (query: ListCriteria): StateModel<R>[] =>
    filterRecords(Object.values(store) as R[], query).map(record => createStateModel(record, resource))

  /**
   * Re-run every live query and hand each subscriber its current answer.
   *
   * Deliberately unconditional: deciding whether a write could have changed a given query's
   * result is the same work as re-running it, and getting that wrong leaves a list stale with
   * nothing to indicate it.
   */
  const _notifyQueryListeners = () => {
    for (const subscription of [...listenerToQuery.values(), ...Object.values(systemToQueries)]) {
      subscription.listener(_queryModels(subscription.query), subscription.systemId)
    }
  }

  const _notifyListeners = (record: R) => {
    for (const listener of recordToListener.get(record.id!) ?? []) {
      listener([createStateModel(record, resource)])
    }
    for (const key of Object.keys(systemToListeners)) {
      const [, ...idsProto] = key.split(':')
      const ids = idsProto.join(':').split(',')
      if (ids.includes(record.id!)) {
        systemToListeners[key](ids.map(id => createStateModel(store[id], resource)), key)
      }
    }
  }

  const resource: StateResource<R> = appendContextual<StateResource<R>>(alias, {
    get: async (id, field, opts) => {
      const record = await resource.load(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record as any
    },

    load: async (id, field, opts) => {
      if (field != null) {
        throw new UnsupportedArgumentError(`${location}:get:filed`)
      }
      if (opts != null) {
        throw new UnsupportedArgumentError(`${location}:get:opts`)
      }
      const record = store[id] as R | undefined

      if (record == null) {
        return null
      }

      return record as any
    },

    /**
     * The `Resource` list contract, criteria and pager included.
     *
     * The default page size is 0 — meaning UNPAGED — rather than the ten a server resource
     * defaults to. Every existing caller of a state resource writes `list()` and expects the
     * whole store back; silently returning the first ten would be a truncation nothing reports.
     * Pagination happens when a pager is actually asked for.
     */
    list: async (criteria, opts) => {
      const options = prepareListOptions(0, criteria, opts)
      const matched = sortRecords(
        filterRecords(Object.values(store) as R[], options.criteria),
        options.pager?.sort
      )

      const size = options.pager?.size ?? 0
      const page = options.pager?.page ?? 0
      const items = size > 0 ? matched.slice(page * size, page * size + size) : matched

      const result: ListResult<R> = {
        items,
        pager: { ...options.pager, total: matched.length }
      }

      return result as any
    },

    all: async () => Object.values(store) as any,

    match: async criteria => filterRecords(Object.values(store) as R[], criteria) as any,

    save: async (record, opts) => {
      const id = record.id ?? DEFAULT_ID
      if (store[id] != null) {
        return resource.update(record, opts)
      }

      return resource.create(record, opts as LifecycleOptions)
    },

    create: async (record, opts) => {
      if (!("id" in record) || record.id == null) {
        record.id = DEFAULT_ID
      }
      if (store[record.id as StoreKey] != null) {
        throw new RecordExists(record.id)
      }
      if (opts != null) {
        throw new UnsupportedArgumentError(`${location}:create:opts`)
      }
      store[record.id as StoreKey] = record as unknown as R

      _notifyListeners(store[record.id as StoreKey])
      _notifyGlobalListeners([store[record.id as StoreKey]])
      _notifyQueryListeners()

      return record as any
    },

    update: async (record, opts) => {
      if (opts != null) {
        throw new UnsupportedArgumentError(`${location}:update:opts`)
      }
      if (!("id" in record) || record.id == null) {
        record.id = DEFAULT_ID
      }
      const reference = store[record.id as StoreKey]
      if (reference == null) {
        throw new UnknownRecordError(record.id)
      }
      Object.assign(reference, record)

      _notifyListeners(reference)
      _notifyGlobalListeners([reference])
      _notifyQueryListeners()

      return reference as any
    },

    delete: async (id, opts) => {
      const _id = typeof id === 'string' ? id : id.id
      if (_id == null) {
        throw new UnsupportedArgumentError('id')
      }
      const record: R | null = store[_id as StoreKey] as R
      if (record == null) {
        return null
      }
      if (opts != null) {
        throw new UnsupportedArgumentError(`${location}:delete:opts`)
      }
      delete store[_id as StoreKey]

      _notifyListeners(record)
      _notifyGlobalListeners([record])
      _notifyQueryListeners()

      return record as any
    },

    pick: async (id, opts) => {
      const _id = typeof id === 'string' ? id : id.id
      if (_id == null) {
        throw new MisshapedRecord('id')
      }
      const record = await resource.delete(_id, opts)
      if (record == null) {
        throw new UnknownRecordError(_id)
      }

      return record as any
    },

    subscribe: params => {
      /**
       * A query subscription is a different thing from an id subscription and cannot be layered
       * on top of one: it creates no placeholder record, and its answer is a set that changes
       * membership rather than a fixed list of records that change content. `id` wins when both
       * are given, so an existing caller that happens to pass a query keeps its behaviour.
       */
      if (params.query != null && params.id == null) {
        const subscription: QuerySubscription = { query: params.query, listener: params.listener }
        const models = _queryModels(params.query)

        if (params._systemId != null) {
          const key = `${params._systemId}:query:${JSON.stringify(params.query)}`
          if (systemToQueries[key] != null) {
            return [_usubscribe(params), models]
          }
          subscription.systemId = key
          systemToQueries[key] = subscription
        } else {
          if (listenerToQuery.has(params.listener)) {
            throw new StateListenerError('subscribed')
          }
          listenerToQuery.set(params.listener, subscription)
        }

        return [_usubscribe(params), models]
      }

      const id = params.id ?? DEFAULT_ID
      const ids = Array.isArray(id) ? id : [id]
      const records = ids.map(id => {
        if (store[id] == null) {
          store[id as StoreKey] = { ...params.default, id } as R
        }
        return createStateModel(store[id], resource)
      })
      if (params._systemId != null) {
        const key = `${params._systemId}:${ids.join(",")}`
        if (systemToListeners[key] != null) {
          return [_usubscribe(params), records]
        }

        systemToListeners[key] = params.listener
      } else {
        if (listenerToRecord.has(params.listener)) {
          throw new StateListenerError('subscribed')
        }
        listenerToRecord.set(params.listener, ids)
        ids.forEach(id => {
          if (!recordToListener.has(id)) {
            recordToListener.set(id, new Set())
          }
          recordToListener.get(id)?.add(params.listener)
        })
      }

      return [_usubscribe(params), records]
    },

    listen: listener => {
      globalListeners.push(listener)

      return () => {
        const index = globalListeners.indexOf(listener)
        if (index >= 0) {
          globalListeners.splice(index, 1)
        }
      }
    },

    erase: async () => {
      await Promise.all(Object.keys(store).map(key => resource.delete(key)))
    }
  })

  return resource
}

export const appendStateResource = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & StateResourceAppend => {
  const resource = createStateResource(alias)

  const _ctx = ctx as T & StateResourceAppend

  _ctx.registerResource(resource)
  if (_ctx.getStateResource == null) {
    _ctx.getStateResource = alias => ctx.resource(alias ?? resource.alias)
  }

  return _ctx
}
