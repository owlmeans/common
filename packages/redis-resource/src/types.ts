import type { LifecycleOptions, Resource, ResourceDbService, ResourceRecord } from '@owlmeans/resource'

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

  subscribe: <Type extends T>(handler: (value: Type) => Promise<void>, key?: SubOpts) => Promise<() => Promise<void>>

  publish: <Type extends T>(value: Type, key?: string) => Promise<void>
}

export type SubOpts = number |string | boolean | SubscriptionOptions

export interface SubscriptionOptions extends LifecycleOptions {
  key?: string
  once?: boolean
}
