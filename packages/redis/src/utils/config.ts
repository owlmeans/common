import type { DbConfig } from '@owlmeans/resource'
import type { RedisOptions, ClusterNode, ClusterOptions } from 'ioredis'
import type { RedisMeta } from '../types.js'

// Translate the configurable `dbIndex` (which may arrive as a string from a file-mounted
// config value) into ioredis' numeric `db` option, and drop `dbIndex` from the spread so
// it isn't forwarded as an unknown option.
const normalizeRedisMeta = (meta?: RedisMeta): RedisOptions => {
  if (meta == null) {
    return {}
  }
  const { dbIndex, ...rest } = meta
  if (dbIndex == null || `${dbIndex}` === '') {
    return rest
  }
  const db = Number(dbIndex)
  if (Number.isNaN(db)) {
    throw new SyntaxError(`Invalid redis dbIndex: "${dbIndex}"`)
  }
  return { ...rest, db }
}

export const prepareSingleRedisOptions = (config: DbConfig<RedisMeta>, host?: string): RedisOptions => {
  host = (host != null ? host : config.host) as string
  if (typeof host !== 'string') {
    throw new SyntaxError('Single redis options can be created only from config referencing single host')
  }
  return {
    host: host,
    port: config.port ?? 6379,
    // Only sent when configured: a bare `requirepass` server rejects AUTH with a username, so an
    // undefined `user` has to stay absent rather than become an empty string.
    ...(config.user != null ? { username: config.user } : {}),
    password: config.secret,
    ...normalizeRedisMeta(config.meta)
  }
}

export const prepareClusterRedisOptions = (config: DbConfig<RedisMeta>): { nodes: ClusterNode[], options: ClusterOptions } => {
  if (!Array.isArray(config.host)) {
    throw new SyntaxError('Cluster redis options can be created only from config referencing multiple hosts')
  }
  return {
    nodes: config.host.map(host => ({ host, port: config.port })), options: {
      dnsLookup: (address, callback) => {
        callback(null, address)
      },
      slotsRefreshTimeout: 20000,
      redisOptions: {
        // tls: { rejectUnauthorized: false }, // @TODO check if it's working
        password: config.secret,
        ...normalizeRedisMeta(config.meta)
      }
    }
  }
}
