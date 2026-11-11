/** What `GUARD_ED25519` signs and verifies — built by `signedPayloadOf` on both halves. */
export interface BasicEd25519Payload {
  /** The JSON body as sent; `{}` for an absent body and for raw bytes (a streamed-body route). */
  body: unknown
  /** The time, then the nonce — key order is part of the signed bytes. */
  headers: Record<string, unknown>
}
