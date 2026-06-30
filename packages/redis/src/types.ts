import type { RedisOptions } from 'ioredis'

export interface RedisMeta extends RedisOptions {
  masterNumber?: number
  slaveNumber?: number
  // Numeric Redis database index (SELECT n). Accepts a string so it can be supplied from a
  // file-mounted config value (e.g. /etc/app-config/cache-db-index); it is coerced to a
  // number before being passed to ioredis. Prefer this over ioredis' `db` for configurability.
  dbIndex?: string | number
}
