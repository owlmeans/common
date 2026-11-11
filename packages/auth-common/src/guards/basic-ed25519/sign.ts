import { AuthroizationType } from '@owlmeans/auth'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { nonceKey, timeKey } from './consts.local.js'
import { signedPayloadOf } from './payload.js'
import type { BasicEd25519SignedRequest, BasicEd25519SignInput } from './types.js'

/**
 * Sign a request the way `GUARD_ED25519` verifies it: the body together with a fresh timestamp and
 * nonce. The guard's own client side signs through it, and so can any process holding a trusted
 * record's private key (a Node test helper, a service) without a context. A body of raw bytes (a
 * streamed-body route's) is signed as `{}`, exactly as the guard verifies it (`signedPayloadOf`).
 */
export const signBasicEd25519Request = async (
  input: BasicEd25519SignInput
): Promise<BasicEd25519SignedRequest> => {
  const headers = { [timeKey]: new Date().toISOString(), [nonceKey]: createIdOfLength(16) }
  // The one payload `handle` rebuilds: the body (`{}` when absent or raw bytes), the time, the nonce.
  const payload = signedPayloadOf(input.body, headers[timeKey], headers[nonceKey])

  const token = [
    AuthroizationType.Ed25519BasicSignature.toUpperCase()
    , ['Credential', input.credential]
    , ['Signature', await input.key.sign(payload)]
  ]

  return {
    authorization: token.map(item => Array.isArray(item) ? item.join('=') : item).join(' '),
    headers: { ...headers },
  }
}
