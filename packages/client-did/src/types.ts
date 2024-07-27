import type { LazyService } from '@owlmeans/context'
import type { DIDWallet, MakeDIDWalletOptions } from '@owlmeans/did'

export interface DIDService extends LazyService {
  wallet: DIDWallet
  exists: () => Promise<boolean>
  create: (opts?: MakeDIDWalletOptions) => Promise<DIDWallet>
  intialize: () => Promise<DIDWallet>
  get: () => DIDWallet
}

export interface DIDServiceAppend {
  getDidService: (alias?: string) => DIDService
}

export interface DIDServiceDeps {
  keys: string
  meta: string
  master: string
}
