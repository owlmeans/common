import type { ResourceRecord } from '@owlmeans/resource'

/** What `GUARD_ED25519` signs and verifies — built by `signedPayloadOf` on both halves. */
export interface BasicEd25519Payload {
  /** The JSON body as sent; `{}` for an absent body and for raw bytes (a streamed-body route). */
  body: unknown
  /** The time, then the nonce — key order is part of the signed bytes. */
  headers: Record<string, unknown>
}

/** A nonce claim as the replay resource stores it: the claim's id, and the delivery it is bound to. */
export interface SignedRequestClaim extends Partial<ResourceRecord> {
  /** `RequestDelivery.id` of the queued request that claimed it; absent for an HTTP request. */
  owner?: string
}

/** A claim the process-local replay store holds: its absolute expiry and the delivery it is bound to. */
export interface MemoryReplayClaim {
  expiry: number
  owner?: string
}

/** The enqueue a queued request's freshness is judged at, and the queue's window after it (ms). */
export interface SignedDeliveryWindow {
  enqueuedAt: number
  maxAge: number
}
