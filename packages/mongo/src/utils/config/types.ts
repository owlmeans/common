import type { MongoClientOptions } from 'mongodb'
import type { DbConfig } from '@owlmeans/resource'

/** A mongo connection string and options built from a db config. */
export interface MongoConfigUtils {
  /**
   * The connection url and client options. A `single` connection talks to one node directly; the
   * cluster one discovers the replica set.
   */
  prepareConfig: (config: DbConfig, single?: boolean) => [string, MongoClientOptions]
  /** `host:port`, or the bare host when the config names no port. */
  port: (host: string, config: DbConfig) => string
}
