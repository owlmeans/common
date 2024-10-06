import type { DbConfig } from '@owlmeans/resource'
import type { RedisOptions, ClusterNode, ClusterOptions } from 'ioredis'
import type { RedisMeta } from '../types.js'

export const prepareSingleRedisOptions = (config: DbConfig<RedisMeta>, host?: string): RedisOptions => {
  host = (host != null ? host : config.host) as string
  if (typeof host !== 'string') {
    throw new SyntaxError('Single redis options can be created only from config referencing single host')
  }
  return {
    host: host,
    port: config.port ?? 6379,
    password: config.secret,
    ...config.meta
  }
}

export const prepareClusterRedisOptions = (config: DbConfig<RedisMeta>): { nodes: ClusterNode[], options: ClusterOptions } => {
  if (!Array.isArray(config.host)) {
    throw new SyntaxError('Cluster redis options can be created only from config referencing multiple hosts')
  }
  return {
    nodes: config.host.map(host => ({ host, port: config.port })), options: {
      dnsLookup: (address, callback) => {
        console.log('DNS lookup', address)
        callback(null, address)
      },
      slotsRefreshTimeout: 20000,
      redisOptions: {
        // tls: { rejectUnauthorized: false }, // @TODO check if it's working
        password: config.secret,
        ...config.meta
      }
    }
  }
}
