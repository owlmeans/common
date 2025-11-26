import { appendContextual } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type {
  GetterOptions, ListOptions, ListResult, LifecycleOptions, ListCriteria, Resource,
  ResourceRecord
} from '@owlmeans/resource'
import { MisshapedRecord, RecordExists, UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'
import type { Config, Context, StaticResourceAppend } from './types.js'

type Getter = string | GetterOptions
type ResourceType = Resource<ResourceRecord>

const stores: Record<string, Map<string, ResourceRecord>> = {}
export const createStaticResource = (alias: string = DEFAULT_ALIAS, key?: string) => {
  key = key ?? alias

  const getStore = () => {
    if (stores[key] == null) {
      stores[key] = new Map()
    }

    return stores[key]
  }

  const resource: Resource<ResourceRecord> = appendContextual<ResourceType>(alias, {
    get: async <T extends ResourceRecord>(id: string, field?: Getter, opts?: LifecycleOptions) => {
      const record = await resource.load<T>(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    load: async <T extends ResourceRecord>(id: string, field?: Getter, opts?: LifecycleOptions) => {
      field = field ?? 'id'
      if (opts != null) {
        throw new UnsupportedArgumentError('static:get:opts')
      }
      const store = getStore()
      const record = field === 'id'
        ? store.get(id) as T | null
        : [...store.values()].find(
          record => record[field as keyof typeof record] === id
        ) as T | undefined

      if (record == null) {
        return null
      }

      return record
    },

    list: async <T extends ResourceRecord>(criteria?: ListOptions | ListCriteria, opts?: ListOptions) => {
      if (criteria != null) {
        throw new UnsupportedArgumentError('static:list:criteria')
      }
      if (opts != null) {
        throw new UnsupportedArgumentError('static:list:opts')
      }

      const result: ListResult<T> = {
        items: [...getStore().values()] as T[]
      }

      return result
    },

    save: async <T extends ResourceRecord>(record: Partial<T>, opts?: Getter) => {
      const store = getStore()
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      store.set(record.id, record as ResourceRecord)

      if (typeof opts === 'object' && opts?.ttl != null) {
        const ttl = opts.ttl instanceof Date
          ? (opts.ttl.getTime() - Date.now()) / 1000
          : typeof opts.ttl === 'number'
            ? opts.ttl * 1000
            : null
        if (ttl == null) {
          throw new UnsupportedArgumentError('static:opts:ttl-string')
        }
        setTimeout(() => record.id != null && void store.delete(record.id), ttl)
      }

      return record as T
    },

    create: async (record, opts) => {
      const store = getStore()
      if (record.id == null) {
        throw new UnknownRecordError('id')
      }
      if (store.has(record.id)) {
        throw new RecordExists(record.id)
      }
      store.set(record.id, record)
      if (opts?.ttl != null) {
        const ttl = opts.ttl instanceof Date
          ? (opts.ttl.getTime() - Date.now()) / 1000
          : typeof opts.ttl === 'number'
            ? opts.ttl * 1000
            : null
        if (ttl == null) {
          throw new UnsupportedArgumentError('static:opts:ttl-string')
        }
        setTimeout(() => record.id != null && void store.delete(record.id), ttl)
      }

      return record as any
    },

    update: async (record, opts) => {
      return resource.save(record, opts)
    },

    delete: async (id, opts) => {
      let record: ResourceRecord | null = null
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new MisshapedRecord('id')
        }
        record = await resource.load(id.id)
      } else if (typeof opts === 'string') {
        record = await resource.load(id, opts)
      } else if (typeof id === 'string') {
        record = await resource.load(id)
      }

      if (record == null) {
        return null
      }

      let field = 'id'
      if (typeof opts === 'string') {
        field = opts
        opts = undefined
      } else if (typeof opts === 'object') {
        field = opts.field ?? field
      }

      id = record.id ?? ''

      if (id === '') {
        throw new MisshapedRecord('id')
      }

      const store = getStore()
      if (store.delete(id)) {
        return record as any
      }

      return null
    },

    pick: async (id, opts) => {
      const record = await resource.delete(id, opts)
      if (record == null) {
        throw new UnknownRecordError((typeof id === 'string' ? id : id.id) ?? 'unknown')
      }

      return record as any
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
