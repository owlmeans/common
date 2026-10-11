import type { InitializedService } from '@owlmeans/context'
import type { Resource, ResourceRecord } from '@owlmeans/resource'

export interface ClientDbService extends InitializedService {
  initialize: (alias?: string) => Promise<ClientDb>
  erase: () => Promise<void>
}

export interface ClientDb {
  /** `undefined` for a key the store does not hold — a miss is not an error at this level. */
  get: <T>(id: string) => Promise<T | undefined>
  set: <T>(id: string, value: T) => Promise<void>
  has: (id: string) => Promise<boolean>
  del: (id: string) => Promise<boolean>
}

export interface ClientResource<T extends ResourceRecord = ResourceRecord> extends Resource<T> {
  db?: ClientDb
  erase: () => Promise<void>
}
