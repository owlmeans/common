import type { DbConfig } from '@owlmeans/config'
import type { MongoService } from '../types.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { Layer } from '@owlmeans/context'
import { sha256 } from '@noble/hashes/sha256'
import { hex } from '@scure/base'

export const dbName = (context: ServerContext<ServerConfig>, service: MongoService, config: DbConfig) => {
  let name = config.schema ?? config.alias ?? service.alias

  console.log(' - compile name :: ', context.cfg.layerId, context.cfg.layer, service.layers)
  if (context.cfg.layerId != null 
    && [Layer.Entity, Layer.User].includes(context.cfg.layer) 
    && service.layers?.includes(Layer.Entity)) {
    name = format(name, context.cfg.layerId)
  }

  return name
}

const format = (name: string, suffix: string) => {
  name = (name + '_' + suffix).replace(/\W/g, '_')

  console.log('FORMAT HEX: ', name, hex.encode(sha256(name)))

  if (name.length > 64) {
    name = name.substring(0, 31) + '_' + hex.encode(sha256(name.substring(31)))
  }

  return name
}
