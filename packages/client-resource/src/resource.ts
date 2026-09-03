import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { appendContextual, assertContext } from '@owlmeans/context'
import {
  applyQuery, filterRecords, firstMatch, MisshapedRecord, RecordExists, ResourceError,
  UnknownRecordError, UnsupportedArgumentError
} from '@owlmeans/resource'
import type { Criteria, FirstOptions, ListOptions, ResourceRecord } from '@owlmeans/resource'
import { DEFAULT_DB_ALIAS, LIST_KEY } from './consts.js'
import type { ClientDb, ClientDbService, ClientResource } from './types.js'
import { base58 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

/**
 * A key-value client store dressed as a resource: records live under their own id and a list of
 * those ids under {@link LIST_KEY} is the only index there is. Queries therefore read the whole
 * set and run through the shared in-memory engine, which is what makes a criteria object mean
 * here exactly what it means against a relational store.
 */
export const appendClientResource = <
  C extends Config, T extends Context<C>, R extends ResourceRecord = ResourceRecord
>(context: T, alias: string): T => {

  const location = `client-resource:${alias}`

  const assert = (): ClientDb => {
    if (resource.db == null) {
      throw new ResourceError(`nodb-${location}`)
    }

    return resource.db
  }

  const ids = async (): Promise<string[]> => await assert().get<string[]>(LIST_KEY) ?? []

  const readAll = async (): Promise<R[]> => {
    const db = assert()
    const records = await Promise.all((await ids()).map(id => db.get<R>(id)))

    return records.filter((record): record is Awaited<R> => record != null) as R[]
  }

  const dropId = async (id: string): Promise<void> => {
    const list = await ids()
    const idx = list.indexOf(id)
    if (idx > -1) {
      list.splice(idx, 1)
      await assert().set(LIST_KEY, list)
    }
  }

  /** An id is a direct key read; criteria have to walk the set. */
  const first = async (
    idOrWhere: string | Criteria<R>, opts?: FirstOptions<R>
  ): Promise<R | null> => typeof idOrWhere === 'string'
    ? await assert().get<R>(idOrWhere) ?? null
    : firstMatch(await readAll(), idOrWhere, opts)

  const resource: ClientResource<R> = appendContextual<ClientResource<R>>(alias, {
    init: async () => {
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const config = context.cfg.dbs?.find(db => db.alias === alias) ?? { service: DEFAULT_DB_ALIAS, host: [] }
      const dbService = context.service<ClientDbService>(config.service)
      resource.db = await dbService.initialize(config.schema ?? alias)
    },

    get: async (idOrWhere: string | Criteria<R>, opts?: FirstOptions<R>): Promise<R> => {
      const record = await first(idOrWhere, opts)
      if (record == null) {
        throw new UnknownRecordError(typeof idOrWhere === 'string' ? idOrWhere : 'criteria')
      }

      return record
    },

    load: async (idOrWhere: string | Criteria<R>, opts?: FirstOptions<R>): Promise<R | null> =>
      await first(idOrWhere, opts),

    /** Unpaged unless a size is asked for. */
    list: async (where?: Criteria<R>, opts?: ListOptions<R>) => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(await readAll(), where, opts)
    },

    count: async (where?: Criteria<R>) => filterRecords(await readAll(), where).length,

    create: async (record: Partial<R>) => {
      const db = assert()

      record.id = record.id ?? base58.encode(randomBytes(32))

      const list = await ids()
      if (list.includes(record.id) || await db.has(record.id)) {
        throw new RecordExists(record.id)
      }
      list.push(record.id)
      await db.set(LIST_KEY, list)
      await db.set(record.id, record)

      return record as R
    },

    /** Replaces the stored record rather than merging into it, as the contract says. */
    update: async (record: Partial<R>) => {
      const db = assert()

      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      if (!await db.has(record.id)) {
        throw new UnknownRecordError(record.id)
      }
      await db.set(record.id, record)

      return record as R
    },

    save: async (record: Partial<R>) => record.id == null || !await assert().has(record.id)
      ? await resource.create(record)
      : await resource.update(record),

    delete: async (id: string) => {
      const db = assert()
      const record = await db.get<R>(id)
      if (record == null) {
        return null
      }
      await db.del(id)
      await dropId(id)

      return record
    },

    take: async (id: string) => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record
    },

    purge: async (where: Criteria<R>) => {
      if (where == null || Object.keys(where).length < 1) {
        throw new UnsupportedArgumentError('purge:empty-criteria')
      }
      const matched = filterRecords(await readAll(), where)
      for (const record of matched) {
        if (record.id != null) {
          await resource.delete(record.id)
        }
      }

      return matched.length
    },

    erase: async () => {
      const db = assert()
      /** The index is emptied in one write, so a failed pass cannot leave it naming dead ids. */
      for (const id of await ids()) {
        await db.del(id)
      }
      await db.set(LIST_KEY, [])
    }
  })

  context.registerResource(resource)

  return context
}
