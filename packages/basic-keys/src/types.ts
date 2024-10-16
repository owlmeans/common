
export interface KeyPair {
  privateKey: string
  publicKey: string
  address: string
  type: string
}

export interface KeyPairModel {
  keyPair?: KeyPair
  sign: (data: unknown) => Promise<string>
  verify: (data: unknown, signature: string) => Promise<boolean>
  export: () => string
  exportPublic: () => string
  exportAddress: () => string
}

export interface KeyPairModelMaker {
  (input?: KeyPair | string): KeyPairModel
}
