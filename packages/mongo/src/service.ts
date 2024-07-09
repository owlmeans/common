import { assertContext, createLazyService, Layer } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import type { MongoService } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { MongoClient } from 'mongodb'
import { prepareConfig } from './utils/config.js'
import { setUpCluster } from './utils/cluster.js'
import type { DbConfig } from '@owlmeans/config'
import { dbName } from './utils/name.js'

type Config = ServerConfig
interface Context<C extends Config = Config> extends ServerContext<C> { }

export const makeMongoService = (alias: string = DEFAULT_ALIAS): MongoService => {
  const location = `mongo:${alias}`

  const cachedAliases = new Set<string>()
  const cachedConfigs = new Map<string, DbConfig>()
  const cachedNames = new Map<string, string>()

  const service: MongoService = createLazyService<MongoService>(alias, {
    clients: {},

    ensureConfigAlias: configAlias => {
      let config: DbConfig | undefined = typeof configAlias === 'object' ? configAlias : undefined
      configAlias = typeof configAlias === 'string' ? configAlias : config?.alias ?? service.alias

      if (cachedAliases.has(configAlias)) {
        return configAlias
      }

      if (configAlias === service.alias) {
        const context = assertContext<Config, Context>(service.ctx as Context, location)
        config = context.cfg.dbs?.find(db => db.alias === service.alias)
        if (config == null) {
          config = context.cfg.dbs?.find(db => db.alias == null)  
          if (config != null) {
            config.alias = service.alias
          }
        }
        if (config == null) {
          throw new SyntaxError(`No config for mongo initialization ${configAlias} in ${service.alias}`)
        }
      }

      cachedAliases.add(configAlias)

      return configAlias
    },

    config: configAlias => {
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      configAlias = service.ensureConfigAlias(configAlias)

      const cached = cachedConfigs.get(configAlias)
      if (cached != null) {
        return cached
      }

      const config = context.cfg.dbs?.find(db => db.alias === configAlias)
      
      if (config == null) {
        throw new SyntaxError(`No config for mongo initialization ${configAlias} in ${service.alias}`)
      }

      cachedConfigs.set(configAlias, config)

      return config
    },

    name: configAlias => {
      configAlias = service.ensureConfigAlias(configAlias)
      const chached = cachedNames.get(configAlias)
      if (chached != null) {
        console.log('RETURN CHACHED NAME', chached)
        return chached
      }

      const context = assertContext<Config, Context>(service.ctx as Context, location)
      const config = service.config(configAlias)

      const name = dbName(context, service, config)

      cachedNames.set(configAlias, name)

      return name
    },

    client: async configAlias => {
      await service.initialize(configAlias)
      configAlias = service.ensureConfigAlias(configAlias)

      return service.clients[configAlias]
    },

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

      if (config.entitySensitive) {
        if (service.layers == null) {
          service.layers = [Layer.Global, Layer.Entity]
        }
      }

      let [url, options] = prepareConfig(config)

      let client = new MongoClient(url, options)

      if (Array.isArray(config.host)) {
        await setUpCluster(client, config)
        await client.close()
        let [url, options] = prepareConfig(config, false)
        client = new MongoClient(url, options)
      }

      if (service.clients[configAlias] != null) {
        throw new SyntaxError(`Cannot replace existing mongo client: ${configAlias} - ${service.alias}`)
      }

      service.clients[configAlias] = client
    },

    reinitializeContext: <T>(context: BasicContext<ServerConfig>) => {
      const _service = makeMongoService(alias)

      _service.ctx = context

      _service.layers = service.layers

      return _service as T
    }
  }, service => async () => {
    const context = assertContext<Config, Context>(service.ctx as Context, location)

    // Try to initialize all connections
    console.log(`INITIALIZE DB IN ANOTHER LAYER ${context.cfg.layer} ${context.cfg.layerId}`)
    context.cfg.dbs?.map(async dbConfig => service.config(dbConfig.alias))

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
