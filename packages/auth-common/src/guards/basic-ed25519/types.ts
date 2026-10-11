import type { GuardService } from '@owlmeans/entrypoint'
import type { ResourceRecord, WriteOptions } from '@owlmeans/resource'
import type { BasicResource } from '@owlmeans/context'

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
}

/** A create-once claim over one signed request identity. */
export interface SignedRequestReplayStore {
  claim: (id: string, expiresAt: Date) => Promise<boolean>
}

/** The small Resource surface needed by the Redis-compatible replay adapter. */
export interface SignedRequestReplayResource extends BasicResource {
  create: (record: Partial<ResourceRecord>, opts?: WriteOptions) => Promise<ResourceRecord>
}
