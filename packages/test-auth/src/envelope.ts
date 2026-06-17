import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { AuthroizationType } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { makeFixtureKeyPair } from './keys.js'

const AUTH_BEARER_PREFIX = AuthroizationType.Ed25519BasicToken.toUpperCase()

/**
 * Wrap a payload in a signed `EnvelopeModel` using a fixture keypair (or one
 * supplied by the caller) and serialize it. Useful in category-B tests that
 * exercise envelope unwrapping/verification without hitting a real signer.
 */
export const signMockEnvelope = async <T extends {} | string>(
  msg: T,
  type: string,
  kind: EnvelopeKind = EnvelopeKind.Token,
  kp: KeyPairModel = makeFixtureKeyPair('test-auth-default')
): Promise<string> => {
  const envelope = makeEnvelopeModel<T>(type)
  envelope.send(msg)
  const signed = await envelope.sign(kp, kind)
  return signed
}

/**
 * Produce an `Authorization` header value of the form
 * `ED25519-BASIC-TOKEN <encoded>` for a given `Auth`. Lets unit tests of
 * header parsing and guard `match` logic generate valid-looking bearers.
 */
export const makeBearer = async (
  auth: Auth,
  kp?: KeyPairModel
): Promise<string> => {
  const encoded = await signMockEnvelope(
    auth as unknown as Record<string, unknown>,
    AuthroizationType.Ed25519BasicToken,
    EnvelopeKind.Token,
    kp
  )
  return `${AUTH_BEARER_PREFIX} ${encoded}`
}
