import type {Context, Config, ResourceDbService, DbConfig} from '../types.js'

export const dbName = <C extends Config, T extends Context<C> = Context<C>>(
  _context: T, service: ResourceDbService<any, any>, config: DbConfig
) => config.schema ?? config.alias ?? service.alias
