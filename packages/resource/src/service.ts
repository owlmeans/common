import { assertContext, createLazyService } from '@owlmeans/context'
import type { InitMethod } from '@owlmeans/context'
import type { Config, Context, DbConfig, ResourceDbService } from './types.js'
import { dbName } from './utils/name.js'

export const createDbService = <
  Db, Client, Service extends ResourceDbService<Db, Client> = ResourceDbService<Db, Client>
>(alias: string, override: Partial<Service>, init?: InitMethod<Service>): Service => {
  const location = `abstract-db-service:${alias}`

  const cachedAliases = new Set<string>()
  const cachedConfigs = new Map<string, DbConfig>()
  const cachedNames = new Map<string, string>()

  const service: Service = createLazyService<Service>(alias, {
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
          config = context.cfg.dbs?.find(db => db.service === service.alias)
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

    ...override
  }, init)

  return service
}
