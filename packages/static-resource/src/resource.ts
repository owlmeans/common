import { appendContextual } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type {
  Criteria, FirstOptions, ListOptions, Resource, ResourceRecord, Ttl, WriteOptions
} from '@owlmeans/resource'
import {
  applyQuery, filterRecords, firstMatch, MisshapedRecord, RecordExists, UnknownRecordError,
  UnsupportedArgumentError
} from '@owlmeans/resource'
import type { Config, Context, StaticResourceAppend } from './types.js'

const stores: Record<string, Map<string, ResourceRecord>> = {}

/**
 * Milliseconds until the record expires, which is what `setTimeout` wants. A number is seconds
 * from now and a Date is the instant to expire at — the two spellings have to land on the same
 * moment, or the same ttl means an hour through one and a second through the other.
 */
const expiresIn = (ttl: Ttl): number =>
  ttl instanceof Date ? ttl.getTime() - Date.now() : ttl * 1000

export const createStaticResource = <T extends ResourceRecord = ResourceRecord>(
  alias: string = DEFAULT_ALIAS, key?: string
): Resource<T> => {
  const storeKey = key ?? alias

  const getStore = (): Map<string, T> => {
    if (stores[storeKey] == null) {
      stores[storeKey] = new Map()
    }

    return stores[storeKey] as Map<string, T>
  }

  const records = (): T[] => [...getStore().values()]

  const expire = (id: string, opts?: WriteOptions): void => {
    if (opts?.ttl == null) {
      return
    }
    const store = getStore()
    setTimeout(() => void store.delete(id), expiresIn(opts.ttl))
  }

  /** An id hits the map directly; criteria go through the shared in-memory engine. */
  const first = (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): T | null =>
    typeof idOrWhere === 'string'
      ? getStore().get(idOrWhere) ?? null
      : firstMatch(records(), idOrWhere, opts)

  const write = (record: Partial<T>, opts?: WriteOptions): T => {
    if (record.id == null) {
      /**
       * The store is a map keyed by id and there is nothing here to mint one from, so a record
       * without an id is misshaped rather than new — `save` cannot create it.
       */
      throw new MisshapedRecord('id')
    }
    getStore().set(record.id, record as T)
    expire(record.id, opts)

    return record as T
  }

  const resource: Resource<T> = appendContextual<Resource<T>>(alias, {
    get: async (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): Promise<T> => {
      const record = first(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof idOrWhere === 'string' ? idOrWhere : 'criteria')
      }

      return record
    },

    load: async (idOrWhere: string | Criteria<T>, opts?: FirstOptions<T>): Promise<T | null> =>
      first(idOrWhere, opts),

    /** Unpaged unless a size is asked for — the whole store is already in memory. */
    list: async (where?: Criteria<T>, opts?: ListOptions<T>) => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(records(), where, opts)
    },

    count: async (where?: Criteria<T>) => filterRecords(records(), where).length,

    create: async (record: Partial<T>, opts?: WriteOptions) => {
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      if (getStore().has(record.id)) {
        throw new RecordExists(record.id)
      }

      return write(record, opts)
    },

    update: async (record: Partial<T>, opts?: WriteOptions) => {
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      if (!getStore().has(record.id)) {
        throw new UnknownRecordError(record.id)
      }

      return write(record, opts)
    },

    save: async (record: Partial<T>, opts?: WriteOptions) => write(record, opts),

    delete: async (id: string) => {
      const store = getStore()
      const record = store.get(id) ?? null
      if (record == null) {
        return null
      }
      store.delete(id)

      return record
    },

    take: async (id: string) => {
      const store = getStore()
      const record = store.get(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }
      store.delete(id)

      return record
    },

    purge: async (where: Criteria<T>) => {
      if (where == null || Object.keys(where).length < 1) {
        throw new UnsupportedArgumentError('purge:empty-criteria')
      }
      const store = getStore()
      const matched = filterRecords(records(), where)
      matched.forEach(record => record.id != null && store.delete(record.id))

      return matched.length
    }
  })

  return resource
}

export const appendStaticResource = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS, key?: string
): T & StaticResourceAppend => {
  const resource = createStaticResource(alias, key)

  const _ctx = ctx as T & StaticResourceAppend

  _ctx.registerResource(resource)
  if (_ctx.getStaticResource == null) {
    _ctx.getStaticResource = alias => ctx.resource(alias ?? resource.alias)
  }

  return _ctx
}
