
export interface WalletFacade {
  sign: (entityId: string | null, payload: Uint8Array, opts?: WalletOptions) => Promise<Uint8Array>

  close: () => Promise<void>
}

export interface WalletOptions {
  purpose?: string
  type?: string
}
