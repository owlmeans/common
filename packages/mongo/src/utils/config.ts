import type { MongoClientOptions } from 'mongodb'
import type { MongoMeta } from '../types.js'
import type { DbConfig } from '@owlmeans/resource'

import { DEF_REPLSET } from '../consts.js'

export const prepareConfig = (config: DbConfig, single: boolean = true): [string, MongoClientOptions] => {
  let host = Array.isArray(config.host) ? config.host[0] : config.host
  const hosts = Array.isArray(config.host) ? config.host : [config.host]

  if (config.user != null) {
    host = `mongodb://${single ? port(host, config) : hosts.map(host => port(host, config)).join(',')}`
  }

  const meta: MongoMeta | undefined = config.meta

  // Only the multi-host cluster connection performs replica-set discovery. A
  // single-node connection talks directly to the node (directConnection: true)
  // and must NOT advertise a replicaSet: against a standalone the driver would
  // block on server selection looking for a primary of a set the node never
  // joins, and against a single-member set it adds nothing over directConnection.
  if (!single) {
    host = `${host}/?replicaSet=${meta?.replicaSet ?? DEF_REPLSET}`
  }

  return [host, config.user != null ? {
    auth: { username: config.user, password: config.secret },
    directConnection: single
  } : {}]
}

export const port = (host: string, config: DbConfig): string =>
  config.port == null ? host : `${host}:${config.port}`
