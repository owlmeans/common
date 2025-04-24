import type { RedisDbService, RedisClient, RedisDb } from '@owlmeans/redis-resource'
import { DEFAULT_ALIAS } from './consts.js'
import { createDbService } from '@owlmeans/resource'
import { assertContext, Layer } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { createClient } from './utils/index.js'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const makeRedisService = (alias: string = DEFAULT_ALIAS): RedisDbService => {
  const location = `redis:${alias}`

  const service: RedisDbService = createDbService<RedisDb, RedisClient, RedisDbService>(
    alias, {
    db: async configAlias => {
      const client = await service.client(configAlias)

      const name = await service.name(configAlias)

      /**
       * @TODO we need to think how we can reuse the initail
       * one instead of duplication for some cases
       */
      return { client: client.duplicate(), prefix: name }
    },

    initialize: async configAlias => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)

      if (service.clients[configAlias] != null) {
        return
      }

      if (service.layers == null) {
        service.layers = [Layer.Global]
      }
      if (config.serviceSensitive && service.layers.includes(Layer.Service)) {
        service.layers.push(Layer.Service)
      }
      if (config.entitySensitive && service.layers.includes(Layer.Entity)) {
        service.layers.push(Layer.Entity)
      }

      let client = await createClient(config)

      // we need to check all hosts for replication consistancy

      if (service.clients[configAlias] != null) {
        throw new SyntaxError(`Cannot replace existing redis client: ${configAlias} - ${service.alias}`)
      }

      process.on('SIGTERM', () => {
        client.quit()
      })

      service.clients[configAlias] = client
    },

    reinitializeContext: <T>(context: BasicContext<ServerConfig>) => {
      const _service = makeRedisService(alias)

      _service.ctx = context

      _service.layers = service.layers

      return _service as T
    }
  }, service => async () => {
    const context = assertContext<Config, Context>(service.ctx as Context, location)

    // Try to initialize all connections
    await context.cfg.dbs?.filter(dbConfig => dbConfig.service === alias).reduce(async (prev, dbConfig) => {
      await prev
      await service.config(dbConfig.alias)
    }, Promise.resolve())

    service.initialized = true
  })

  return service
}

export const appendRedis = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makeRedisService(alias)

  context.registerService(service)

  return context
}
