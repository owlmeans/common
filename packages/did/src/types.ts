import type { Profile } from '@owlmeans/auth'
import type { KeyPair, KeyPairModel } from '@owlmeans/basic-keys'
import type { Resource, ResourceRecord } from '@owlmeans/resource'

export interface DIDWallet {
  store: DIDStore
  
  generate: (opts?: MnemonicOptions) => Promise<void>
  
  mnemonic: (crash?: boolean) => Promise<string | false>

  master: () => Promise<DIDKeyModel>

  add: (key: DIDKeyModel, meta: KeyMeta) => Promise<void>

  meta: (key: string | DIDKeyModel) => Promise<KeyMeta>

  update: (key: DIDKeyModel, meta: KeyMeta) => Promise<[DIDKeyModel, KeyMeta]>

  get: (did: string) => Promise<DIDKeyModel | null>

  find: (meta: Partial<KeyMeta>) => Promise<DIDKeyModel[]>

  provide: (mate: Partial<KeyMeta>) => Promise<DIDKeyModel[]>

  remove: (did: string | KeyMeta | DIDKeyModel) => Promise<DIDKeyModel>

  all: () => Promise<DIDKeyModel[]>
  
  allMeta: () => Promise<KeyMeta[]>
}

export interface MakeDIDWalletOptions {
  force?: boolean
  allowEmpty?: boolean
  mnemonic?: MnemonicOptions
  type?: string
  allowCustomType?: boolean
}

export interface DIDStore {
  master: MasterResource
  keys: KeyPairResource
  meta: KeyMetaResource
}

export interface MasterResource extends Resource<KeySeedRecord> {
}

export interface KeyPairResource extends Resource<KeyPairRecord> {
}

export interface KeyMetaResource extends Resource<KeyMetaRecord> {
}

export interface KeyPairRecord extends ResourceRecord, DIDKeyPair {
}

export interface KeySeedRecord extends ResourceRecord, KeySeed {
}

export interface KeyMetaRecord extends ResourceRecord, KeyMeta {
  id: string
}

export interface KeySeed extends DIDKeyPair {
  entropy?: string
  seed?: string
}

export interface KeyMeta extends Partial<Profile> {
  id: string
  name: string
  entityId?: string
}

export interface MnemonicOptions {
  size?: number
}

export interface DIDKeyPair extends KeyPair {
  path?: string
  parent?: string 
}

export interface DIDKeyModel extends KeyPairModel  {
  keyPair?: DIDKeyPair
  derive: (path: string) => DIDKeyModel
}
