import type { AuthCredentials } from '@owlmeans/auth'
import type { KeyPairModel, PayloadSigner, PayloadVerifier, UnpackedAuthCredentials, UnsignedAuthCredentials } from './types.js'
import canonicalize from 'canonicalize'

export const packAuthCredentials = async <T extends {} | undefined>(
  auth: UnsignedAuthCredentials,
  extra: T,
  signer: KeyPairModel | PayloadSigner
): Promise<AuthCredentials> => {
  const unsigned: UnsignedAuthCredentials = {
    ...auth,
    ...(extra == null ? {} : { credential: canonicalize(extra) as string })
  }

  if (typeof signer !== 'function') {
    const _signer = signer
    signer = async payload => await _signer.sign(payload)
  }

  const signature = await signer(unsigned)

  return {
    ...auth,
    credential: extra == null ? signature : canonicalize({ ...extra, signature }) as string,
  }
}

export const unpackAuthCredentials = async <T extends {} | undefined>(
  auth: AuthCredentials,
  verifier?: KeyPairModel | PayloadVerifier
): Promise<UnpackedAuthCredentials<T>> => {
  let signature: string = ''
  let extras: T
  try {
    extras = JSON.parse(auth.credential)
    if (typeof extras === 'object' && extras != null && "signature" in extras) {
      signature = extras.signature as string
      delete extras.signature
    }
  } catch {
    signature = auth.credential
    extras = undefined as T
  }
  const unsigned: UnsignedAuthCredentials = { 
    ...auth,
    ...(extras == null ? {} : { credential: canonicalize(extras) as string })
  }
  let isValid: boolean | undefined = undefined

  if (verifier != null) {
    if (typeof verifier !== 'function') {
      const _verifier = verifier
      verifier = async (payload, signature) => await _verifier.verify(payload, signature)
    }

    isValid = await verifier(unsigned, signature)
  }

  return { unsigned, signature, isValid, extras }
}
