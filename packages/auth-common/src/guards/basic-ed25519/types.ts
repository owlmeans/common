import type { GuardService } from '@owlmeans/entrypoint'
import type { ResourceRecord, WriteOptions } from '@owlmeans/resource'
import type { BasicResource } from '@owlmeans/context'
import type { KeyPairModel } from '@owlmeans/basic-keys'

export interface BasicEd25519Guard extends GuardService {
}

export interface BasicEd25519GuardOptions {
  /**
   * Legacy resource alias. A Redis resource registered under this alias gives replay protection
   * shared by every replica; when it is absent the guard falls back to its process-local store.
   */
  cache?: string
  /** Explicit replay store, for consumers that do not register a Resource on the context. */
  replay?: SignedRequestReplayStore
  /**
   * How long (ms) a nonce claimed by a queued request stays bound to its job at least, so the broker's
   * own redelivery of that job is admitted on it. Default {@link BED255_DELIVERY_TTL}. A delivery that
   * carries the queue's window (`RequestDelivery.maxAge`) keeps its claim until that window after the
   * signature has passed, whichever is later.
   */
  deliveryTtl?: number
}

/** A create-once claim over one signed request identity. */
export interface SignedRequestReplayStore {
  /**
   * Claim `id` until `expiresAt`. `owner` binds the claim to one delivery of the request (a queued
   * job, `RequestDelivery.id`); a claim another caller already holds answers `false` — whoever holds it.
   */
  claim: (id: string, expiresAt: Date, owner?: string) => Promise<boolean>
  /**
   * The owner a live claim was bound to — `null` when the claim is gone or was taken without an
   * owner (an HTTP request). A store without it never recognises a redelivery: every second
   * presentation of a nonce is a replay there.
   */
  holder?: (id: string) => Promise<string | null>
}

/** The small Resource surface needed by the Redis-compatible replay adapter. */
export interface SignedRequestReplayResource extends BasicResource {
  create: (record: Partial<ResourceRecord>, opts?: WriteOptions) => Promise<ResourceRecord>
  /** Reads a claim back for {@link SignedRequestReplayStore.holder}; without it no redelivery is recognised. */
  load?: (id: string) => Promise<ResourceRecord | null>
}

/** What `signBasicEd25519Request` signs: the request body and the signer's identity. */
export interface BasicEd25519SignInput {
  /**
   * The body exactly as it will be sent. An absent body and raw bytes (a `Blob`, an `ArrayBuffer`, a
   * typed array, a stream — a streamed-body route's) are signed as `{}`, as the guard verifies them:
   * such bytes are not covered by the signature.
   */
  body?: unknown
  /** The signer's trusted-record `id` — the guard loads the verifying key by it. */
  credential: string
  /** The signer's key pair; it must carry the private key (a `TrustedRecord` with a `secret`). */
  key: KeyPairModel
}

/** A request signature the `GUARD_ED25519` guard accepts. */
export interface BasicEd25519SignedRequest {
  /** The `authorization` header: `ED25519-BASIC-SIGNATURE Credential=<id> Signature=<signature>`. */
  authorization: string
  /** The signed time and nonce headers under their lowercase names; send them with the request. */
  headers: Record<string, string>
}
