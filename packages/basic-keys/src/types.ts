import type { AuthCredentials } from '@owlmeans/auth'

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

export interface PayloadSigner {
  <T extends {}>(payload: T): Promise<string>
}

export interface PayloadVerifier {
  <T extends {}>(payload: T, signature: string): Promise<boolean>
}

export interface UnpackedAuthCredentials<T extends {} | undefined = undefined> {
  unsigned: AuthCredentials | Omit<AuthCredentials, 'credential'>
  signature: string
  isValid?: boolean
  extras: T
}

export type UnsignedAuthCredentials = AuthCredentials | Omit<AuthCredentials, "credential">
