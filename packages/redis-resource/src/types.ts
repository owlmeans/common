import type {
  PubSubResource, Resource, ResourceDbService, ResourceRecord, StreamResource, WatchableResource
} from '@owlmeans/resource'

import type { RedisCommander, Redis, Cluster, RedisOptions, ClusterNode, ClusterOptions } from 'ioredis'

export interface RedisDbService extends ResourceDbService<RedisDb, RedisClient> {
  /**
   * The connection settings behind `alias`, in the shape a client is built from.
   *
   * A pooled client cannot be shared by everything: a consumer that blocks on a read holds the
   * connection for the duration, so anything doing that needs one of its own. Handing out the
   * settings keeps that decision with the caller while the configuration stays here — the
   * alternative is every consumer re-deriving them from `cfg.dbs` and drifting.
   */
  options: (alias?: string) => RedisConnection
}

/** Either a single-node or a cluster connection, plus the key namespace `alias` resolves to. */
export interface RedisConnection {
  single?: RedisOptions
  cluster?: { nodes: ClusterNode[], options: ClusterOptions }
  prefix: string
}

export type RedisClient = Redis | Cluster

export interface RedisDb {
  client: RedisCommander
  prefix: string
}

/**
 * A `Resource` over redis strings — one JSON document per namespaced key — composed with the
 * three capabilities redis actually has: pub/sub channels, keyspace watching of a single record,
 * and streams with consumer groups.
 */
export interface RedisResource<T extends ResourceRecord> extends Resource<T>,
  PubSubResource<T>, WatchableResource<T>, StreamResource<T> {
  name?: string

  db: RedisDb

  /** The namespaced redis key for `key`, or the namespace's glob when `key` is omitted. */
  key: (key?: string) => string
}
