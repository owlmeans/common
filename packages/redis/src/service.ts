import type { RedisDbService, RedisClient, RedisDb } from '@owlmeans/redis-resource'
import { DEFAULT_ALIAS } from './consts.js'
import { createDbService } from '@owlmeans/resource'
import { assertContext } from '@owlmeans/context'
import { createClient, redisOptionsUtils } from './utils/index.js'
import type { Config, Context } from './types.local.js'


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
      return { client: (client as { duplicate: () => RedisClient }).duplicate(), prefix: name }
    },

    options: configAlias => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)
      const prefix = service.name(configAlias)

      const hosts = Array.isArray(config.host) ? config.host : [config.host]

      return hosts.length > 1
        ? { cluster: redisOptionsUtils.cluster(config), prefix }
        : { single: redisOptionsUtils.single(config, hosts[0]), prefix }
    },

    initialize: async configAlias => {
      configAlias = service.ensureConfigAlias(configAlias)
      const config = service.config(configAlias)

      if (service.clients[configAlias] != null) {
        return
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
