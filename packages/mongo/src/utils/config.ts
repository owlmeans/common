import type { DbConfig } from '@owlmeans/config'
import type { MongoClientOptions } from 'mongodb'
import type { MongoMeta } from '../types.js'
import { DEF_REPLSET } from '../consts'

export const prepareConfig = (config: DbConfig, single: boolean = true): [string, MongoClientOptions] => {
  let host = Array.isArray(config.host) ? config.host[0] : config.host
  const hosts = Array.isArray(config.host) ? config.host : [config.host]

  if (config.user != null) {
    host = `mongodb://${single ? port(host, config) : hosts.map(host => port(host, config)).join(',')}`
  }

  const meta: MongoMeta | undefined = config.meta

  host = `${host}/?replicaSet=${meta?.replicaSet ?? DEF_REPLSET}`

  return [host, config.user != null ? {
    auth: { username: config.user, password: config.secret },
    directConnection: single
  } : {}]
}

export const port = (host: string, config: DbConfig): string =>
  config.port == null ? host : `${host}:${config.port}`
