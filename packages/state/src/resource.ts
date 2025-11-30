import { appendContextual } from '@owlmeans/context'
import { MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'
import type { LifecycleOptions, ListResult, ResourceRecord } from '@owlmeans/resource'
import type { StateListener, StateResource, StateResourceAppend, StateSubscriptionOption } from './types.js'
import { DEFAULT_ALIAS, DEFAULT_ID } from './consts'
import { StateListenerError } from './errors.js'
import { createStateModel } from './utils/model.js'
import type { BasicContext as Context, BasicConfig as Config } from '@owlmeans/context'

export const createStateResource = <R extends ResourceRecord>(alias: string = DEFAULT_ALIAS): StateResource<R> => {
  const location = `state-resource:${alias}`

  const store: { [id: string]: R } = {}
  const recordToListener = new Map<string, Set<StateListener<R>>>()
  const listenerToRecord = new Map<StateListener<R>, string[]>()
  const globalListeners: StateListener<R>[] = []
  const systemToListeners: Record<string, StateListener<R>> = {}

  type StoreKey = keyof typeof store

  const _notifyGlobalListeners = (records: R[]) => {
    globalListeners.forEach(listener => listener(
      records.map(record => createStateModel(record, resource))
    ))
  }

  const _usubscribe = (params: StateSubscriptionOption<R>) => () => {
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

    list: async (criteria, opts) => {
      if (criteria != null) {
        throw new UnsupportedArgumentError(`${location}:list:criteria`)
      }
      if (opts != null) {
        throw new UnsupportedArgumentError(`${location}:list:opts`)
      }

      const result: ListResult<R> = {
        items: Object.entries(store).map(([, record]) => record) as R[]
      }

      return result as any
    },

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
