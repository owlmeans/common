import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import { MisshapedRecord, prepareListOptions, RecordExists, UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'
import type { RedisClient, RedisDbService, RedisResource } from './types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { DEFAULT_DB_ALIAS, DEFAULT_PAGE_SIZE } from './consts.js'
import { appendContextual, assertContext } from '@owlmeans/context'
import type { BasicContext, Contextual } from '@owlmeans/context'
import { prepareSubOptions } from './utils/options.js'
import { createIdOfLength } from '@owlmeans/basic-ids'

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

    save: async (record, opts) => {
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      const existing = await resource.load(record.id)
      if (existing != null) {
        return resource.update(record, opts)
      }

      return resource.create(record, typeof opts !== 'string' ? opts : undefined)
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
    },

    subscribe: async (handler, opts) => {
      opts = prepareSubOptions(opts)

      let _unsubascribeCalled = false
      const unsusbscibe = async () => {
        if (_unsubascribeCalled) {
          return
        }
        _unsubascribeCalled = true
        try {
          await subscriber.punsubscribe(resource.key(opts.key)).then(() => subscriber.quit())
        } catch (e) {
          console.error('Try to unsubscribe redis resource', e)
        }
      }

      const listener = (value: R) => {
        handler(value as any)
        if (opts.once === true) {
          void unsusbscibe()
        }
      }

      const subscriber = (resource.db.client as RedisClient).duplicate()
      if (opts.key != null && null != await resource.load(opts.key)) {
        await subscriber.psubscribe(`__keyspace@0__:${resource.key(opts.key)}`)
        subscriber.on('pmessage', async (_, channel) => {
          const [, , ...key] = (channel as string).split(':')
          const record = await resource.load(key.join(':'))
          listener(record ?? { id: key, __null: true } as any as R)
        })
      } else {
        await subscriber.psubscribe(resource.key(opts.key))
        subscriber.on('pmessage', (_, __, message) => listener(JSON.parse(message)))
      }


      if (opts.ttl != null) {
        const ttl = opts.ttl instanceof Date
          ? opts.ttl.getTime() - Date.now()
          : typeof opts.ttl === 'number'
            ? opts.ttl * 1000
            : null
        if (ttl == null) {
          throw new UnsupportedArgumentError(`subscribe:ttl:${typeof opts.ttl}`)
        }
        setTimeout(unsusbscibe, ttl)
      }

      return unsusbscibe
    },

    publish: async (record, key) => {
      await resource.db.client.publish(resource.key(key), JSON.stringify(record))
    },

    stream: async (key, record) => {
      await resource.db.client.xadd(
        resource.key(key), 'MAXLEN', '~', 10000, '*', 'payload', JSON.stringify(record)
      )
    },

    consume: async function* (key, group, consumer = createIdOfLength(15)) {
      console.log(`Establish redis stream consumer: ${group ?? 'no-group'}:${consumer} for ${key}`)
      const streamKey = resource.key(key)
      if (group == null) {
        let id = '$'
        do {
          const resp = await resource.db.client.xread(
            'BLOCK', 1000, 'STREAMS', streamKey, id
          )
          if (!resp) continue

          const [, entries] = resp[0]
          for (const [entryId, fields] of entries) {
            id = entryId
            const line = fields[1]
            try {
              console.log('received', fields)
              yield JSON.parse(line)
            } catch (e) {
              console.error('Cannot parse redis stream entry', e)
            }
          }
        } while (true)
      } else {
        const _reclaim = async function* () {
          try {
            const [, entries] = await resource.db.client.xautoclaim(
              streamKey, group, 'junitor', 60000, '0-0', 'COUNT', 10
            )
            for (const [id, fields] of entries as [string, string[]][]) {
              console.log('Reclaimed', id)
              const line = fields[1]
              try {
                yield JSON.parse(line)
              } catch (e) {
                console.error('Cannot parse reclaimed redis stream entry', e)
              }
              await resource.db.client.xack(streamKey, group, id)
            }
          } catch { }
        }
        try {
          await resource.db.client.xgroup('CREATE', streamKey, group, '$', 'MKSTREAM')
        } catch (e) {
          console.error('Error in redis stream consumer group', e)
        }
        do {
          console.log('Try to consume')
          const resp = await resource.db.client.xreadgroup(
            'GROUP', group, consumer,
            'BLOCK', 1000, 'STREAMS', streamKey, '>'
          )
          if (!resp) {
            yield* _reclaim()
            continue
          }

          const [, entries] = resp[0] as [string, Array<[string, string[]]>]
          for (const [entryId, fields] of entries) {
            const line = fields[1]
            try {
              yield JSON.parse(line)
              await resource.db.client.xack(streamKey, group, entryId)
            } catch (e) {
              console.error('Cannot parse redis stream entry', e)
            }
          }
        } while (true)
      }
    }
  } as Partial<T>)

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const redis = context.service<RedisDbService>(serviceAlias ?? dbAlias)
    await redis.ready()
    const db = await redis.db(dbAlias)
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
