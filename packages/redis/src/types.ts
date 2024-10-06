import type { RedisOptions } from 'ioredis'

export interface RedisMeta extends RedisOptions {
  masterNumber?: number
  slaveNumber?: number
}
