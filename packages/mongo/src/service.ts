import { assertContext, Layer } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'
import { prepareConfig } from './utils/config.js'
import { setUpCluster } from './utils/cluster.js'
import type { MongoDbService } from '@owlmeans/mongo-resource'
import { createDbService } from '@owlmeans/resource'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const makeMongoDbService = (alias: string = DEFAULT_ALIAS): MongoDbService => {
  const location = `mongo:${alias}`

  const service: MongoDbService = createDbService<Db, MongoClient, MongoDbService>(alias, {
    db: async configAlias => {
      const client = await service.client(configAlias)

      const name = await service.name(configAlias)

      return client.db(name)
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

      let [url, options] = prepareConfig(config)

      let client = new MongoClient(url, options)

      if (Array.isArray(config.host)) {
        // @TODO Number of tries can be configurable
        for (let i = 0; i < 3; ++i) {
          console.log(`Try to initialize cluster: ${i}`)
          if (await setUpCluster(client, config)) {
            break
          }
        }
        await client.close()
        let [url, options] = prepareConfig(config, false)
        client = new MongoClient(url, options)
      }

      process.on('SIGTERM', () => {
        console.log(`Exit mongo client ${configAlias}`)
        client.close()
      })

      if (service.clients[configAlias] != null) {
        throw new SyntaxError(`Cannot replace existing mongo client: ${configAlias} - ${service.alias}`)
      }

      service.clients[configAlias] = client
    },

    reinitializeContext: <T>(context: BasicContext<ServerConfig>) => {
      const _service = makeMongoDbService(alias)

      _service.ctx = context

      _service.layers = service.layers

      return _service as T
    }
  }, service => async () => {
    const context = assertContext<Config, Context>(service.ctx as Context, location)

    // Try to initialize all connections
    console.log(`INITIALIZE MONGO IN LAYER ${context.cfg.layer} ${context.cfg.layerId}`)
    await context.cfg.dbs?.filter(dbConfig => dbConfig.service === alias).reduce(async (prev, dbConfig) => {
      console.log('... initializ spcicific config', dbConfig.service, dbConfig.alias)
      await prev
      await service.config(dbConfig.alias)
    }, Promise.resolve())

    service.initialized = true
  })

  return service
}

export const appendMongo = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = makeMongoDbService(alias)

  context.registerService(service)

  return context
}
