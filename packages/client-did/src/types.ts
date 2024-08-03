import type { AuthCredentials } from '@owlmeans/auth'
import type { LazyService } from '@owlmeans/context'
import type { DIDKeyModel, DIDWallet, MakeDIDWalletOptions } from '@owlmeans/did'

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

export interface DIDAccountModel {
  did: DIDKeyModel
  authenticate: <T extends Partial<AuthCredentials>>(auth: T) => Promise<T>
}
