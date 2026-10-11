import type { AuthCredentials } from '@owlmeans/auth'
import type { KeyPairModel, PayloadSigner, PayloadVerifier, UnpackedAuthCredentials, UnsignedAuthCredentials } from '../types.js'

/** Signed authentication credentials: the signature packed into `credential` with any extras. */
export interface AuthCredentialsHelper {
  /** Sign `auth` (plus canonicalized `extra`) and pack the signature into `credential`. */
  packAuthCredentials: <T extends {} | undefined>(
    auth: UnsignedAuthCredentials,
    extra: T,
    signer: KeyPairModel | PayloadSigner
  ) => Promise<AuthCredentials>
  /** Take packed credentials apart and, given a verifier, check the signature. */
  unpackAuthCredentials: <T extends {} | undefined>(
    auth: AuthCredentials,
    verifier?: KeyPairModel | PayloadVerifier
  ) => Promise<UnpackedAuthCredentials<T>>
}
