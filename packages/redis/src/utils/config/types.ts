import type { DbConfig } from '@owlmeans/resource'
import type { RedisOptions, ClusterNode, ClusterOptions } from 'ioredis'
import type { RedisMeta } from '../../types.js'

/** ioredis connection options built from a db config. */
export interface RedisOptionsUtils {
  /** Options for one host: `host` when given, else the config's single host. */
  single: (config: DbConfig<RedisMeta>, host?: string) => RedisOptions
  /** Options for a cluster over the config's host list. */
  cluster: (config: DbConfig<RedisMeta>) => { nodes: ClusterNode[], options: ClusterOptions }
}
