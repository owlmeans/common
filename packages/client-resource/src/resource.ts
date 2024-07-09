import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import { appendContextual, assertContext } from '@owlmeans/context'
import { ResourceError, UnknownRecordError } from '@owlmeans/resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { DEFAULT_DB_ALIAS } from './consts'
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

    get: async <T extends ResourceRecord>(id: string) => {
      const record = await resource.load<T>(id)

      if (record == null) {
        throw new UnknownRecordError(id)
      }

      return record as T
    },


    load: async <T extends ResourceRecord>(id: string) => {
      const db = assert()

      return await db.get(id) as T | null
    },

    save: async <T extends ResourceRecord>(record: Partial<T>) => {
      const db = assert()

      record.id = record.id ?? base58.encode(randomBytes(32))

      await db.set(record.id, record as T)

      const list: string[] = await db.get('_list') ?? []
      list.push(record.id)

      return record as T
    }
  })

  context.registerResource(resource)

  return context
}

/**
  list: <Type extends T>(criteria?: ListCriteriaParams, opts?: ListOptions) => Promise<ListResult<Type>>
  create: <Type extends T>(record: Partial<Type>, opts?: LivecycleOptions) => Promise<Type>
  update: <Type extends T>(record: Type, opts?: Getter) => Promise<Type>
  delete: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type | null>
  pick: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type>
}
 */