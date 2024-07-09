
import type { DbConfig } from '@owlmeans/config'
import type { LazyService } from '@owlmeans/context'
import type { MongoClient, Db } from 'mongodb'

export interface MongoService extends LazyService {
  clients: Record<string, MongoClient>

  initialize: (alias?: string) => Promise<void>

  config: (alias?: string) => DbConfig

  ensureConfigAlias: (alias?: string | DbConfig) => string

  name: (alias?: string | DbConfig) => string

  client: (alias?: string) => Promise<MongoClient>

  db: (alias?: string) => Promise<Db>
}

export interface MongoMeta {
  replicaSet?: string
}
