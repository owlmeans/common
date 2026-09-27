import type {
  Criteria, FirstOptions, ListOptions, ListResult, ResourceRecord, SubscribeOptions, Ttl,
  Unsubscribe, WriteOptions
} from '@owlmeans/resource'
import {
  applyQuery, filterRecords, firstMatch, matchCriteria, MisshapedRecord, RecordExists,
  UnknownRecordError, UnsupportedArgumentError
} from '@owlmeans/resource'
import type { RedisClient, RedisDbService, RedisResource } from './types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import {
  CONSUMER_ID_LENGTH, DEFAULT_DB_ALIAS, DEFAULT_STREAM_BLOCK, READ_BATCH, RECLAIM_COUNT,
  RECLAIM_IDLE, SCAN_BATCH, STREAM_MAX_LENGTH
} from './consts.js'
import { appendContextual, assertContext } from '@owlmeans/context'
import { createIdOfLength, uuid } from '@owlmeans/basic-ids'

type Config = ServerConfig
type Context<C extends Config = Config> = ServerContext<C>

/**
 * A `Resource` over plain redis strings: one JSON document per namespaced key.
 *
 * Reads by id are O(1) GETs. Everything else — a criteria read, a listing, a count, a purge —
 * walks this resource's OWN namespace with SCAN and evaluates the criteria in memory, because
 * redis has no index to ask. That is affordable for a small namespaced set (a session cache, an
 * adapter store) and wrong for anything unbounded or hot; a resource that needs real queries
 * belongs in mongo or postgres.
 */
export const makeRedisResource = <
  R extends ResourceRecord, T extends RedisResource<R> = RedisResource<R>
>(
  alias: string, dbAlias = DEFAULT_DB_ALIAS, serviceAlias = DEFAULT_DB_ALIAS
): T => {
  const location = `redis-resource:${alias}`

  /**
   * A number is seconds from now; a `Date` is the absolute instant to expire at.
   *
   * The absolute form needs PEXPIREAT, not EXPIREAT: `Date.getTime()` is milliseconds while
   * EXPIREAT reads its argument as seconds, so the timestamp landed tens of thousands of years
   * out and the record never expired.
   */
  const applyTtl = async (key: string, ttl: Ttl): Promise<void> => {
    if (ttl instanceof Date) {
      await resource.db.client.pexpireat(key, ttl.getTime())
    } else {
      await resource.db.client.expire(key, ttl)
    }
  }

  /** Close a subscription once its lifetime runs out — seconds from now, or an instant. */
  const armTtl = (close: Unsubscribe, ttl?: Ttl): void => {
    if (ttl == null) {
      return
    }
    setTimeout(() => void close(), ttl instanceof Date ? ttl.getTime() - Date.now() : ttl * 1000)
  }

  /** The record as it goes into redis: whatever was passed, under the id it is keyed by. */
  const withId = (record: Partial<R>, id: string): R => ({ ...record, id } as unknown as R)

  /**
   * Write the record under its key. SET both creates and replaces, which is what lets `save`
   * upsert without reading first.
   */
  const put = async (id: string, record: Partial<R>, opts?: WriteOptions): Promise<R> => {
    const key = resource.key(id)
    const stored = withId(record, id)
    await resource.db.client.set(key, JSON.stringify(stored))
    if (opts?.ttl != null) {
      await applyTtl(key, opts.ttl)
    }

    return stored
  }

  /**
   * Every key under this resource's prefix, collected with SCAN.
   *
   * Never KEYS: KEYS blocks the server for the length of the whole sweep, while SCAN walks the
   * keyspace in bounded bites. SCAN may hand the same key back twice across iterations, which is
   * why the keys land in a Set.
   */
  const scanKeys = async (): Promise<string[]> => {
    const found = new Set<string>()
    let cursor = '0'
    do {
      const [next, batch] = await resource.db.client.scan(
        cursor, 'MATCH', resource.key(), 'COUNT', SCAN_BATCH
      )
      cursor = next
      batch.forEach(key => found.add(key))
    } while (cursor !== '0')

    return [...found]
  }

  /**
   * The namespace as key/record pairs, read in MGET batches.
   *
   * O(N) over the resource's own namespace — every criteria that is not a bare id is answered
   * from this in memory. A key holding something other than a string, this resource's own streams
   * included, reads back as `null` from MGET and is skipped.
   */
  const readNamespace = async (): Promise<Array<[string, R]>> => {
    const keys = await scanKeys()
    const entries: Array<[string, R]> = []
    for (let from = 0; from < keys.length; from += READ_BATCH) {
      const batch = keys.slice(from, from + READ_BATCH)
      const values = await resource.db.client.mget(batch)
      values.forEach((value, index) => {
        if (typeof value === 'string') {
          entries.push([batch[index], JSON.parse(value)])
        }
      })
    }

    return entries
  }

  const readRecords = async (): Promise<R[]> => (await readNamespace()).map(([, record]) => record)

  /** `{ id: 'x' }` is the one criteria redis can answer by key; anything else needs the walk. */
  const soleId = (where: Criteria<any>): string | null => {
    const keys = Object.keys(where)

    return keys.length === 1 && keys[0] === 'id' && typeof where.id === 'string' ? where.id : null
  }

  const loadOne = async (
    idOrWhere: string | Criteria<any>, opts?: FirstOptions<any>
  ): Promise<R | null> => {
    const id = typeof idOrWhere === 'string' ? idOrWhere : soleId(idOrWhere)
    if (id != null) {
      const value = await resource.db.client.get(resource.key(id))

      return value == null ? null : JSON.parse(value)
    }

    return firstMatch(await readRecords(), idOrWhere as Criteria<any>, opts)
  }

  /**
   * One dedicated connection per subscription: a redis client in subscriber mode accepts nothing
   * but (un)subscribe commands, so the resource's own client has to stay out of it.
   */
  const listen = async (
    pattern: string, onMessage: (channel: string, message: string) => void,
    opts?: { once?: boolean, ttl?: Ttl }
  ): Promise<Unsubscribe> => {
    const subscriber = (resource.db.client as RedisClient).duplicate()
    let closed = false
    const unsubscribe: Unsubscribe = async () => {
      if (closed) {
        return
      }
      closed = true
      try {
        await subscriber.punsubscribe(pattern)
        await subscriber.quit()
      } catch (e) {
        console.error(`${location}: failed to unsubscribe ${pattern}`, e)
      }
    }

    await subscriber.psubscribe(pattern)
    subscriber.on('pmessage', (_pattern, channel, message) => {
      /**
       * `once` closes before the handler's own work finishes on purpose: the handler may await a
       * read, and a second message arriving meanwhile would fire a subscription that has already
       * delivered its one message.
       */
      if (opts?.once === true) {
        void unsubscribe()
      }
      onMessage(channel, message)
    })
    armTtl(unsubscribe, opts?.ttl)

    return unsubscribe
  }

  const resource: T = appendContextual<T>(alias, {
    key: (key?: string) => `${resource.db.prefix}:${key ?? '*'}`,

    /**
     * @throws {UnknownRecordError}
     */
    get: async (idOrWhere: string | Criteria<any>, opts?: FirstOptions<any>): Promise<R> => {
      const record = await loadOne(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(
          typeof idOrWhere === 'string' ? idOrWhere : JSON.stringify(idOrWhere)
        )
      }

      return record
    },

    load: loadOne,

    /**
     * Unpaged by default: without a `size` every match comes back. A `page` on its own is a
     * caller error rather than a window over an implied default — there is no default here to
     * take a window of.
     *
     * @throws {UnsupportedArgumentError} on `page` without `size`.
     */
    list: async (where?: Criteria<any>, opts?: ListOptions<any>): Promise<ListResult<R>> => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(await readRecords(), where, opts)
    },

    count: async (where?: Criteria<any>): Promise<number> =>
      filterRecords(await readRecords(), where).length,

    /**
     * SET NX rather than a read followed by a write: two callers racing for the same id both saw
     * an empty key, both "created" the record, and the loser's write silently won.
     *
     * A record with no id gets one — redis needs a key, and `save` relies on this to create.
     *
     * @throws {RecordExists}
     */
    create: async (record: Partial<R>, opts?: WriteOptions): Promise<R> => {
      const id = record.id ?? uuid()
      const key = resource.key(id)
      const stored = withId(record, id)
      if (await resource.db.client.set(key, JSON.stringify(stored), 'NX') == null) {
        throw new RecordExists(id)
      }
      if (opts?.ttl != null) {
        await applyTtl(key, opts.ttl)
      }

      return stored
    },

    /**
     * Replaces the whole record: what is stored afterwards is exactly what was passed, not a
     * merge over what was there. A renewal has to pass its TTL again — SET drops the old expiry.
     *
     * @throws {MisshapedRecord} without an id, {@link UnknownRecordError} when the id is absent.
     */
    update: async (record: Partial<R>, opts?: WriteOptions): Promise<R> => {
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      if (await resource.db.client.exists(resource.key(record.id)) < 1) {
        throw new UnknownRecordError(record.id)
      }

      return put(record.id, record, opts)
    },

    /** Creates when the record carries no id, replaces otherwise — SET does both. */
    save: async (record: Partial<R>, opts?: WriteOptions): Promise<R> =>
      record.id == null ? resource.create(record, opts) : put(record.id, record, opts),

    /**
     * GETDEL — reading the record and dropping the key in one command, so two callers cannot both
     * be handed the same record. Needs redis 6.2 or newer.
     */
    delete: async (id: string): Promise<R | null> => {
      const value = await resource.db.client.getdel(resource.key(id))

      return value == null ? null : JSON.parse(value)
    },

    /**
     * Delete-and-return where absence is an error — the consume-once read.
     *
     * @throws {UnknownRecordError}
     */
    take: async (id: string): Promise<R> => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    /**
     * Bulk delete over the namespace walk. An empty criteria object is refused: wiping a whole
     * namespace is what FLUSHDB is for, not something a filter that came back empty should do.
     *
     * @throws {UnsupportedArgumentError} on empty criteria.
     */
    purge: async (where: Criteria<any>): Promise<number> => {
      if (where == null || Object.keys(where).length < 1) {
        throw new UnsupportedArgumentError('purge:empty-criteria')
      }
      const keys = (await readNamespace())
        .filter(([, record]) => matchCriteria(record, where))
        .map(([key]) => key)

      let deleted = 0
      for (let from = 0; from < keys.length; from += READ_BATCH) {
        deleted += await resource.db.client.del(keys.slice(from, from + READ_BATCH))
      }

      return deleted
    },

    publish: async (value: R, channel?: string): Promise<void> => {
      await resource.db.client.publish(resource.key(channel), JSON.stringify(value))
    },

    /**
     * Channel pub/sub. The channel name is namespaced like a key, and an omitted channel listens
     * to the resource's whole namespace — `key()` yields the glob that PSUBSCRIBE matches on.
     */
    subscribe: async (
      handler: (value: R) => void | Promise<void>, opts?: SubscribeOptions
    ): Promise<Unsubscribe> => listen(
      resource.key(opts?.channel),
      (_channel, message) => void handler(JSON.parse(message)),
      opts
    ),

    /**
     * Keyspace notifications for ONE record: every write, expiry or delete on its key hands the
     * handler the current value, or `null` once the key is gone.
     *
     * Keyspace events are published per database and this listens on db 0, so deployments sharing
     * one instance isolate on the key prefix, never on the db index. The server also has to have
     * `notify-keyspace-events` enabled — redis emits nothing otherwise.
     */
    watch: async (
      id: string, handler: (value: R | null) => void | Promise<void>,
      opts?: Omit<SubscribeOptions, 'channel'>
    ): Promise<Unsubscribe> => listen(
      `__keyspace@0__:${resource.key(id)}`,
      () => void loadOne(id).then(record => handler(record)),
      opts
    ),

    stream: async (key: string, value: R): Promise<void> => {
      await resource.db.client.xadd(
        resource.key(key), 'MAXLEN', '~', STREAM_MAX_LENGTH, '*', 'payload', JSON.stringify(value)
      )
    },

    consume: async function* (
      key: string, opts?: { group?: string, consumer?: string, block?: number }
    ): AsyncGenerator<R> {
      const streamKey = resource.key(key)
      const group = opts?.group
      const consumer = opts?.consumer ?? createIdOfLength(CONSUMER_ID_LENGTH)
      const block = opts?.block ?? DEFAULT_STREAM_BLOCK

      if (group == null) {
        let id = '$'
        do {
          const resp = await resource.db.client.xread('BLOCK', block, 'STREAMS', streamKey, id)
          if (!resp) continue

          const [, entries] = resp[0]
          for (const [entryId, fields] of entries) {
            id = entryId
            try {
              yield JSON.parse(fields[1])
            } catch (e) {
              console.error('Cannot parse redis stream entry', e)
            }
          }
        } while (true)
      } else {
        /**
         * Entries a consumer took and never acknowledged, claimed under THIS consumer's name.
         * Claiming them for a fixed name instead left them owned by a consumer that never reads,
         * so a crashed worker's entries moved once and then stalled for good.
         */
        const reclaim = async function* (): AsyncGenerator<R> {
          try {
            const [, entries] = await resource.db.client.xautoclaim(
              streamKey, group, consumer, RECLAIM_IDLE, '0-0', 'COUNT', RECLAIM_COUNT
            )
            for (const [id, fields] of entries as [string, string[]][]) {
              try {
                yield JSON.parse(fields[1])
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
          const resp = await resource.db.client.xreadgroup(
            'GROUP', group, consumer,
            'BLOCK', block, 'STREAMS', streamKey, '>'
          )
          if (!resp) {
            yield* reclaim()
            continue
          }

          const [, entries] = resp[0] as [string, Array<[string, string[]]>]
          for (const [entryId, fields] of entries) {
            try {
              yield JSON.parse(fields[1])
              await resource.db.client.xack(streamKey, group, entryId)
            } catch (e) {
              console.error('Cannot parse redis stream entry', e)
            }
          }
        } while (true)
      }
    }
  } as unknown as Partial<T>)

  resource.init = async () => {
    const context = assertContext<Config, Context>(resource.ctx as Context, location)
    const redis = context.service<RedisDbService>(serviceAlias)
    await redis.ready()
    const db = await redis.db(dbAlias)
    const _pref = (val: string) => val.replaceAll(/\W+/g, '_')

    resource.db = {
      client: db.client,
      prefix: `${_pref(db.prefix)}-${_pref(resource.name ?? alias)}`
    }
  }

  return resource
}
