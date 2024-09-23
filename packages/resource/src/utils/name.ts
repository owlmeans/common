import { Layer } from '@owlmeans/context'
import type {Context, Config, ResourceDbService, DbConfig} from '../types.js'

import { sha256 } from '@noble/hashes/sha256'
import { hex } from '@scure/base'

export const dbName = <C extends Config, T extends Context<C> = Context<C>>(context: T, service: ResourceDbService<any,any>, config: DbConfig) => {
  let name = config.schema ?? config.alias ?? service.alias

  if (context.cfg.layerId != null 
    && [Layer.Entity, Layer.User].includes(context.cfg.layer) 
    && service.layers?.includes(Layer.Entity)) {
    name = format(name, context.cfg.layerId)
  }

  return name
}

const format = (name: string, suffix: string) => {
  name = (name + '_' + suffix).replace(/\W/g, '_')

  if (name.length > 64) {
    name = name.substring(0, 31) + '_' + hex.encode(sha256(name.substring(31)))
  }

  return name
}
