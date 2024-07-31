import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { appendContextual, assertContext } from '@owlmeans/context'
import { RecordExists, ResourceError, UnknownRecordError } from '@owlmeans/resource'
import type { ListCriteria, ListPager, ResourceRecord } from '@owlmeans/resource'
import { DEFAULT_DB_ALIAS, LIST_KEY } from './consts.js'
import type { ClientDb, ClientDbService, ClientResource } from './types.js'
import { base58 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const appendClientResource = <C extends Config, T extends Context<C>>(context: T, alias: string): T => {

  const location = `client-resource:${alias}`

  const assert = (): ClientDb => {
    if (resource.db == null) {
      throw new ResourceError(`nodb-${location}`)
    }

    return resource.db
  }

  const resource: ClientResource<ResourceRecord> = appendContextual<ClientResource<ResourceRecord>>(alias, {
    init: async () => {
      const context = assertContext<Config, Context>(resource.ctx as Context, location)
      const config = context.cfg.dbs?.find(db => db.alias === alias) ?? { service: DEFAULT_DB_ALIAS, host: [] }
      const dbService = context.service<ClientDbService>(config.service)
      resource.db = await dbService.initialize(config.schema ?? alias)
    },

    get: async id => {
      const record = await resource.load(id)

      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record as any
    },


    load: async id => {
      const db = assert()

      return await db.get(id) as any | null
    },

    list: async (criteria, opts) => {
      if (criteria == null) {
        criteria = {}
        opts = { pager: { page: 0, size: 10 } }
      }
      if ("pager" in criteria) {
        opts = criteria
        criteria = criteria.criteria as ListCriteria
      }
      const db = assert()
      const list = await db.get<string[]>(LIST_KEY)

      const pager: ListPager = opts?.pager ?? { page: 0, size: 10 }
      const conditions = Object.entries(criteria as ListCriteria ?? {})
      pager.page = pager.page ?? 0
      pager.size = pager.size ?? 10

      const result: ResourceRecord[] = []
      let skip = pager.page * pager.size
      let total = 0
      let added = 0
      for (const id of list) {
        const record = await db.get<ResourceRecord>(id)
        if (record != null) {
          if (!(conditions.length === 0 || conditions.every(
            ([key, value]) => record[key as keyof typeof record] === value
          ))) {
            continue
          }
          if (skip-- <= 0 && added < pager.size) {
            added++
            result.push(record)
          }
          ++total
        }
      }

      return { items: result as any[], pager: { ...pager, total } }
    },

    create: async record => {
      const db = assert()

      record.id = record.id ?? base58.encode(randomBytes(32))

      if (await db.has(record.id)) {
        throw new RecordExists(record.id)
      }

      const list: string[] = await db.get(LIST_KEY) ?? []
      if (list.includes(record.id)) {
        throw new RecordExists(record.id)
      }
      list.push(record.id)
      await db.set(LIST_KEY, list)
      await db.set(record.id, record)

      return record as any
    },

    update: async record => {
      const db = assert()

      if (record.id == null) {
        throw new UnknownRecordError('update')
      }

      const update = await resource.load(record.id)
      if (update == null) {
        throw new UnknownRecordError(record.id)
      }

      Object.assign(update, record)

      await db.set(record.id, update)

      return record as any
    },

    delete: async id => {
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new UnknownRecordError('delete')
        }
        return resource.delete(id.id)
      }

      const db = assert()
      if (!await db.has(id)) {
        return null
      }

      const record = await db.get(id)
      if (record == null) {
        throw new SyntaxError('We should not try to delete record that we know that not exists')
      }
      await db.del(id)
      const list: string[] = await db.get(LIST_KEY) ?? []
      const idx = list.indexOf(id)
      if (idx > -1) {
        list.splice(idx, 1)
        await db.set(LIST_KEY, list)
      }

      return record as any
    },

    pick: async id => {
      if (typeof id === 'object') {
        if (id.id == null) {
          throw new UnknownRecordError('pick')
        }
        return resource.pick(id.id)
      }

      const db = assert()
      const record = await db.get(id)
      if (record != null) {
        await db.del(id)
      } else {
        throw new UnknownRecordError(id)
      }
      const list: string[] = await db.get(LIST_KEY) ?? []
      const idx = list.indexOf(id)
      if (idx > -1) {
        list.splice(idx, 1)
        await db.set(LIST_KEY, list)
      }

      return record as any
    },

    save: async record => {
      if (record.id == null || (await resource.load(record.id) == null)) {
        return resource.create(record)
      }

      return resource.update(record)
    },

    erase: async () => {
      console.log('Erasing all records', location)
      const db = assert()
      const list: string[] = await db.get(LIST_KEY) ?? []
      const count = await Promise.all(list.map(id => resource.delete(id)))
      console.log('erased', count.length)
    }
  })

  context.registerResource(resource)

  return context
}
