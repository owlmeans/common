import { assertContext, createLazyService } from '@owlmeans/context'
import type { MongoService } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { MongoClient } from 'mongodb'
import { prepareConfig } from './utils/config.js'
import { setUpCluster } from './utils/cluster.js'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const makeMongoService = (alias: string = DEFAULT_ALIAS): MongoService => {
  const location = `mongo:${alias}`
  const service: MongoService = createLazyService<MongoService>(alias, {
    clients: {},

    initialize: async alias => {
      alias = alias ?? service.alias
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      let config = context.cfg.dbs?.find(db => db.alias === alias)
      if (config == null) {
        config = context.cfg.dbs?.find(db => db.alias == null)
      }
      if (config == null) {
        throw new SyntaxError(`No config for mongo initialization ${alias} in ${service.alias}`)
      }
      config.alias = alias

      let [url, options] = prepareConfig(config)

      let client = new MongoClient(url, options)

      if (Array.isArray(config.host)) {
        await setUpCluster(client, config)
        await client.close()
        let [url, options] = prepareConfig(config, false)
        client = new MongoClient(url, options)
      }

      if (service.clients[alias] != null) {
        throw new SyntaxError(`Cannot replace existing mongo client: ${alias} - ${service.alias}`)
      }

      service.clients[alias] = client

    },

    reinitializeContext: <T>() => {
      const service = makeMongoService(alias)

      service.clients = service.clients

      return service as T
    }
  }, service => async () => {
    const context = assertContext<Config, Context>(service.ctx as Context, location)
    if (context == null) {
      throw new SyntaxError('No context in during mongo initialization')
    }

    service.initialized = true
  })

  return service
}

export const appendMongo = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makeMongoService(alias)

  context.registerService(service)

  return context
}
