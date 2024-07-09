import type { InitializedService } from '@owlmeans/context'
import type { Resource, ResourceRecord } from '@owlmeans/resource'

export interface ClientDbService extends InitializedService {
  initialize: (alias?: string) => Promise<ClientDb>
}

export interface ClientDb {
  get: <T>(id: string) => Promise<T>
  set: <T>(id: string, value: T) => Promise<void>
  has: (id: string) => Promise<boolean>
  del: (id: string) => Promise<boolean>
}

export interface ClientResource<T extends ResourceRecord> extends Resource<T> {
  db?: ClientDb
}
