import type { DIDKeyPair, KeyMeta } from '@owlmeans/did'

export interface WalletFacade {
  sign: (entityId: string | null, payload: Uint8Array, opts?: WalletOptions) => Promise<Uint8Array>

  createKey: (entityId: string, opts?: NewKeyOptions) => Promise<string>

  // TODO: This operation is maximum unsecure. It needs to be double checked by user
  // and probably limited by the client to only OwlMeans services
  getMasterDid: (opts?: RequestReason) => Promise<string>

  getPublicDetails: (did: string, opts?: RequestReason) => Promise<{
    key: Partial<DIDKeyPair>,
    meta: KeyMeta
  }>

  requestPermissions:  (methods: string[], opts?: WalletOptions) => Promise<boolean>

  close: () => Promise<void>
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
