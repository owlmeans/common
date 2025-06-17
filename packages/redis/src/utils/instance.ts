import type { DbConfig } from '@owlmeans/resource'
import type { RedisClient } from '@owlmeans/redis-resource'
import {Redis} from 'ioredis'
import { prepareSingleRedisOptions } from './config.js'
import { ensuerCluster } from './cluster.js'

export const createClient = async (config: DbConfig): Promise<RedisClient> => {
  if (Array.isArray(config.host) && config.host.length === 1) {
    config.host = config.host[0]
  }
  if (typeof config.host === 'string') {
    return new Redis(prepareSingleRedisOptions(config))
  }

  return await ensuerCluster(config)
}
