import { createService } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type { NativeDbService } from './types.js'
import type { ClientDb } from '@owlmeans/client-resource'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

type Config = ClientConfig
interface Context<C extends Config = Config> extends ClientContext<C> { }

export const makeNativeDbService = (alias: string = DEFAULT_ALIAS): NativeDbService => {
  const stores: Record<string, ClientDb> = {}
  const service = createService<NativeDbService>(alias, {
    initialize: async alias => {
      alias = alias ?? DEFAULT_ALIAS

      if (stores[alias] != null) {
        return stores[alias]
      }

      const _key = (id: string) => alias + ':' + id

      const db: ClientDb = {
        get: async <T>(id: string) => {
          const value = await AsyncStorage.getItem(_key(id))
          try {
            return JSON.parse(value as string) as T
          } catch {
            return value as T
          }
        },

        set: async <T>(id: string, value: T) => {
          await AsyncStorage.setItem(_key(id), JSON.stringify(value))
        },

        has: async id => {
          return null != await AsyncStorage.getItem(_key(id))
        },

        del: async id => {
          const has = await db.has(id)
          if (has) {
            await AsyncStorage.removeItem(_key(id))
          }

          return has
        }
      }

      return stores[alias] = db
    },

    erase: async () => AsyncStorage.clear()
  }, service => async () => {
    service.initialized = true
  })

  return service
}

export const appendNativeDbService = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makeNativeDbService(alias)

  context.registerService(service)

  return context
}
