import { nonceKey, timeKey } from './consts.local.js'
import type { BasicEd25519Payload } from './types.local.js'

/**
 * Raw bytes, as `@owlmeans/api` sends them unserialized: a `Blob`, an `ArrayBuffer`, a typed array or
 * a `Buffer`, a Node stream.
 */
const isBinary = (body: unknown): boolean =>
  typeof body === 'object' && body != null && (
    (typeof Blob !== 'undefined' && body instanceof Blob)
    || body instanceof ArrayBuffer || ArrayBuffer.isView(body)
    || typeof (body as { pipe?: unknown }).pipe === 'function'
  )

/**
 * The value both halves of `GUARD_ED25519` sign: the body, then the time and the nonce.
 *
 * An absent body and a body of raw bytes are both `{}`. The bytes of a streamed-body route
 * (`streamBody()` of `@owlmeans/route`) are therefore never covered by the signature: the caller
 * holds a stream it cannot read twice, and the server has not read the body when its guard runs. The
 * signature still proves who called and when (time, nonce, replay claim); a route that must prove its
 * bytes declares their digest (in the query) and checks it against what it stored.
 */
export const signedPayloadOf = (body: unknown, time: unknown, nonce: unknown): BasicEd25519Payload => ({
  body: body == null || isBinary(body) ? {} : body,
  headers: { [timeKey]: time, [nonceKey]: nonce },
})
