import { createService } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type { WebDbService } from './types.js'
import type { ClientDb } from '@owlmeans/client-resource'
import { get, set, del } from 'idb-keyval'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const makeWebDbService = (alias: string = DEFAULT_ALIAS): WebDbService => {
  const stores: Record<string, ClientDb> = {}
  const service = createService<WebDbService>(alias, {
    initialize: async alias => {
      alias = alias ?? DEFAULT_ALIAS

      if (stores[alias] != null) {
        return stores[alias]
      }

      const _key = (id: string) => alias + ':' + id

      const db: ClientDb = {
        get: async <T>(id: string) => {
          return await get(_key(id)) as T
        },

        set: async <T>(id: string, value: T) => {
          await set(_key(id), value)
        },

        has: async id => {
          return null != await get(_key(id))
        },

        del: async id => {
          const has = await db.has(id)
          if (has) {
            await del(_key(id))
          }

          return has
        }
      }

      return stores[alias] = db
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}

export const appendWebDbService = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makeWebDbService(alias)

  context.registerService(service)

  return context
}
