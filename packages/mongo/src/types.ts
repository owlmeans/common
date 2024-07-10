
import type { DbConfig } from '@owlmeans/config'
import type { MongoClient } from 'mongodb'
import type { MongoDbService }  from '@owlmeans/mongo-resource'

export interface MongoService extends MongoDbService {
  clients: Record<string, MongoClient>

  initialize: (alias?: string) => Promise<void>

  ensureConfigAlias: (alias?: string | DbConfig) => string

  name: (alias?: string | DbConfig) => string

  client: (alias?: string) => Promise<MongoClient>
}

export interface MongoMeta {
  replicaSet?: string
}
