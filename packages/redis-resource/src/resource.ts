import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import { MisshapedRecord, prepareListOptions, RecordExists, UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'
import type { RedisDbService, RedisResource } from './types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE } from './consts.js'
import { appendContextual, assertContext } from '@owlmeans/context'
import type { BasicContext, Contextual } from '@owlmeans/context'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

export const makeRedisResource = <
  R extends ResourceRecord, T extends RedisResource<R> = RedisResource<R>
>(
  alias: string, dbAlias = DEFAULT_DB_ALIAS, serviceAlias = DEFAULT_DB_ALIAS,
  makeCustomResource?: ResourceMaker<R, T>
): T => {
  const location = `redis-resource:${alias}`

  const resource: T = appendContextual<T>(alias, {
    key: key => `${resource.db.prefix}:${key ?? '*'}`,

    get: async (id, field, opts) => {
      const record = await resource.load(id, field, opts)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    load: async (id, field, opts) => {
      if (typeof field === 'object') {
        opts = field
        field = field.field
      }
      if (opts != null) {
        throw new UnsupportedArgumentError('load:opts')
      }
      if (field === 'id' || field == null) {
        const val = await resource.db.client.get(resource.key(id))
        if (val == null) {
          return null
        }

        return JSON.parse(val)
      }
      const list = await resource.list({ [field]: id }, { pager: { size: 1 } })

      return list.items[0] ?? null
    },

    update: async (record, opts) => {
      let field = 'id'
      if (typeof opts === 'string') {
        field = opts
      } else if (typeof opts === 'object') {
        field = opts.field ?? field
      }
      if (field !== 'id' && record[field as keyof typeof record] == null) {
        throw new MisshapedRecord('no-field-value')
      }
      const id = field == 'id' ? record.id : record[field as keyof typeof record] as string
      if (id == null) {
        throw new MisshapedRecord('id')
      }
      const _opts = typeof opts === 'object' ? opts : {}
      const existing = await resource.get(id, field)
      const updated = { ...existing, ...record }
      await resource.db.client.set(resource.key(id), JSON.stringify(updated))
      if (_opts.ttl != null) {
        if (_opts.ttl instanceof Date) {
          await resource.db.client.expireat(resource.key(id), _opts.ttl.getTime())
        } else {
          await resource.db.client.expire(resource.key(id), _opts.ttl)
        }
      }

      return updated
    },

    create: async (record, opts) => {
      if (record.id == null) {
        throw new UnknownRecordError('id')
      }
      if (await resource.load(record.id) != null) {
        throw new RecordExists(record.id)
      }

      const id = record.id
      await resource.db.client.set(resource.key(id), JSON.stringify(record))
      if (opts?.ttl != null) {
        if (opts.ttl instanceof Date) {
          await resource.db.client.expireat(resource.key(id), opts.ttl.getTime())
        } else {
          await resource.db.client.expire(resource.key(id), opts.ttl)
        }
      }

      return record
    },

    delete: async (id, opts) => {
      let record: R | null = null
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new MisshapedRecord('id')
        }
        record = await resource.load(id.id)
      } else if (typeof opts === 'string') {
        record = await resource.load(id, opts)
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

      if (await resource.db.client.del(resource.key(id)) > 0) {
        return record
      }

      return null
    },

    pick: async (id, opts) => {
      let record: R | null = null
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new MisshapedRecord('id')
        }
        record = await resource.load(id.id)
      } else {
        record = await resource.load(id, opts)
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

      if (await resource.db.client.del(resource.key(id)) > 0) {
        return record
      }

      throw new UnknownRecordError(id)
    },

    list: async (criteria, opts) => {
      const options = prepareListOptions(DEFAULT_PAGE_SIZE, criteria, opts)
      criteria = options.criteria
      const pager = options.pager ?? {}

      const keys = await resource.db.client.keys(resource.key())
      pager.total = keys.length
      pager.page = pager.page ?? 0
      pager.size = pager.size ?? DEFAULT_PAGE_SIZE

      if (keys.length === 0) {
        return { items: [], pager }
      }

      const start = pager.page * pager.size
      const slice = keys.toSpliced(start, pager.size)

      return {
        pager, items: (await Promise.all(slice.map(
          async key => await resource.db.client.get(key)
        ))).filter(val => typeof val === 'string').map(
          val => JSON.parse(val as string)
        )
      }
    }
  } as Partial<T>)

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const redit = context.service<RedisDbService>(serviceAlias ?? dbAlias)
    await redit.ready()
    const db = await redit.db(dbAlias)
    const _pref = (val: string) => val.replaceAll(/\W+/g, '_')
    resource.db = {
      client: db.client,
      prefix: `${_pref(db.prefix)}-${_pref(resource.name ?? alias)}`
    }
  }

  resource.reinitializeContext = <Type extends Contextual>(context: BasicContext<Config>) => {
    const resource = (makeCustomResource?.(dbAlias, serviceAlias)
      ?? makeRedisResource<R, T>(alias, dbAlias, serviceAlias)) as unknown as Type

    resource.ctx = context

    return resource as Type
  }

  return resource
}
