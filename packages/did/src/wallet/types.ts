import { DIDKeyPair, KeyMeta } from '../types.js'

export interface WalletFacade {
  sign: (entityId: string | null, payload: Uint8Array, opts?: WalletOptions) => Promise<Uint8Array>

  createKey: (entityId: string, opts?: NewKeyOptions) => Promise<string>

  getEntityKey: (entityId: string, opts?: WalletOptions) => Promise<WalletKey>

  // TODO: This operation is maximum unsecure. It needs to be double checked by user
  // and probably limited by the client to only OwlMeans services
  getMasterDid: (opts?: RequestReason) => Promise<string>

  selectKey: (opts?: WalletOptions) => Promise<WalletKey>

  getPublicDetails: (did: string, opts?: RequestReason) => Promise<WalletKey>

  requestPermissions: (methods: string[], opts?: WalletOptions) => Promise<boolean>

  close: () => Promise<void>
}

export interface WalletKey {
  key: Partial<DIDKeyPair>
  meta: KeyMeta
}

export interface RequestReason {
  intro?: string
  reason?: string
  timestamp?: number
}

export interface WalletOptions extends RequestReason {
  purpose?: string
  type?: string
  profileId?: string
  service?: string
}

export interface NewKeyOptions extends WalletOptions {
  name: string
}
