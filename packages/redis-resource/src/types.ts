import type { Resource, ResourceDbService, ResourceRecord } from '@owlmeans/resource'

import type { RedisCommander, Redis, Cluster } from 'ioredis'

export interface RedisDbService extends ResourceDbService<RedisDb, RedisClient> {
}

export type RedisClient = Redis | Cluster

export interface RedisDb {
  client: RedisCommander
  prefix: string
}

export interface RedisResource<T extends ResourceRecord> extends Resource<T> {
  name?: string

  db: RedisDb

  key: (key?: string) => string
}
