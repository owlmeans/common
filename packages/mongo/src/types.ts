
import type { LazyService } from '@owlmeans/context'
import type { MongoClient } from 'mongodb'

export interface MongoService extends LazyService {
  clients: Record<string, MongoClient>

  initialize: (alias?: string) => Promise<void>
}

export interface MongoMeta {
  replicaSet?: string
}
